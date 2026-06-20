import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { isAllocationConflict, WorkspacesService } from './workspaces.service';
import { SwarmService } from '@/infrastructure/swarm/swarm.service';
import { CaddyService } from '@/infrastructure/proxy/caddy.service';
import { DbService } from '@/infrastructure/db/db.service';
import { AuditService } from '@/infrastructure/audit/audit.service';
import { sessionRequests } from '@/infrastructure/db/schema';
import { EnvironmentImageBuilderService } from '@/domain/environments/environment-image-builder.service';
import { RetentionService } from '@/domain/retention/retention.service';
import { WorkspaceActivityLogService } from './workspace-activity-log.service';

type SessionRequest = typeof sessionRequests.$inferSelect;
export type WorkspaceStartResult =
  | 'started'
  | 'already-active'
  | 'no-capacity'
  | 'not-found'
  | 'start-in-progress';

@Injectable()
export class WorkspacesReconcilerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(WorkspacesReconcilerService.name);
  private reconciling = false;
  private sweeping = false;

  constructor(
    private readonly workspacesService: WorkspacesService,
    private readonly swarmService: SwarmService,
    private readonly caddyService: CaddyService,
    private readonly dbService: DbService,
    private readonly audit: AuditService,
    private readonly environmentImageBuilder: EnvironmentImageBuilderService,
    private readonly retention: RetentionService,
    private readonly activityLog: WorkspaceActivityLogService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.dbService.withAdvisoryLock(773171001, async () => {
      await this.restoreRunningRoutes();
      await this.removeOrphanLegacyVolumes();
    });
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async reconcile(): Promise<void> {
    if (this.reconciling) return;
    this.reconciling = true;
    try {
      await this.dbService.withAdvisoryLock(773171001, async () => {
        await this.ingestWorkspaceActivity();
        await this.recoverStartingServiceIds();
        await this.convergeStarting();
        await this.stopRequested();
        const runningSessions = await this.workspacesService.findRunning();
        await this.stopIdleRunning(runningSessions);
        await this.expireRunning(runningSessions);
      });
    } catch (err) {
      this.logger.error('Reconcile loop error', (err as Error).message);
    } finally {
      this.reconciling = false;
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async sweepOrphans(): Promise<void> {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      await this.dbService.withAdvisoryLock(773171001, async () => {
        await this.repairRunningRoutes();
        await this.removeOrphanServices();
        await this.removeOrphanRoutes();
        await this.removeOrphanVolumes();
      });
    } catch (err) {
      this.logger.error('Workspace sweep loop error', (err as Error).message);
    } finally {
      this.sweeping = false;
    }
  }

  private async restoreRunningRoutes(): Promise<void> {
    const runningSessions = await this.workspacesService.findRunning();
    for (const session of runningSessions) {
      if (session.proxyPath && session.publishedPort) {
        await this.safeEnsureRoute(session.proxyPath, session.publishedPort);
      }
    }
  }

  async startApprovedRequest(requestId: string, userId: string): Promise<WorkspaceStartResult> {
    const result = await this.dbService.withAdvisoryLock(this.lockKey(requestId), async () => {
      const request = await this.workspacesService.getRequest(requestId);
      if (!request || request.userId !== userId || request.status !== 'approved')
        return 'not-found';
      const active = await this.workspacesService.findActiveByUser(userId);
      if (active) return 'already-active';
      return (await this.provisionOne(request)) ? 'started' : 'no-capacity';
    });
    return result ?? 'start-in-progress';
  }

  private async provisionOne(request: SessionRequest): Promise<boolean> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const worker = await this.workspacesService.pickWorker(request.gpuTarget);
      if (!worker) {
        this.logger.warn(
          `No available worker for gpuTarget=${request.gpuTarget}, request=${request.id}`,
        );
        return false;
      }

      const port = await this.workspacesService.allocatePort();
      if (port === null) {
        this.logger.warn(`No available port for request=${request.id}`);
        return false;
      }

      const runtime = await this.workspacesService.getEnvironmentImage(request.runtimeImageId);
      if (!runtime) {
        this.logger.error(`Runtime image not found for request=${request.id}`);
        return false;
      }

      const { raw: jupyterToken, hash: tokenHash } =
        await this.workspacesService.generateJupyterToken(request.id);

      let session: Awaited<ReturnType<WorkspacesService['createFromApprovedRequest']>>;
      try {
        session = await this.workspacesService.createFromApprovedRequest(
          request,
          worker,
          port,
          tokenHash,
        );
      } catch (err) {
        if (isAllocationConflict(err)) {
          this.logger.warn(
            `Workspace allocation conflict for request=${request.id}, retry=${attempt}`,
          );
          continue;
        }
        throw err;
      }

      this.logger.log(
        `Session ${session.id} created for request ${request.id}, provisioning swarm service...`,
      );

      const constraints: string[] = worker.swarmNodeId ? [`node.id == ${worker.swarmNodeId}`] : [];

      try {
        const workspaceImage = await this.environmentImageBuilder.ensureImage(runtime);
        const existingServiceId = await this.swarmService.findServiceByName(
          session.swarmServiceName!,
        );
        const result = existingServiceId
          ? { serviceId: existingServiceId, serviceName: session.swarmServiceName! }
          : await this.swarmService.createService({
              name: session.swarmServiceName!,
              image: workspaceImage,
              constraints,
              cpus: request.requestedCpu,
              memoryBytes: request.requestedMemoryGb * 1024 * 1024 * 1024,
              envVars: [`JUPYTER_TOKEN=${jupyterToken}`, `JUPYTER_BASE_URL=${session.proxyPath}/`],
              publishedPort: port,
              volumeName: this.workspaceVolumeName(session.swarmServiceName!),
            });

        await this.workspacesService.setSwarmServiceId(session.id, result.serviceId);
        await this.audit.record({
          actorUserId: null,
          action: 'workspace-swarm-service-created',
          targetType: 'workspace',
          targetId: session.id,
          metadata: {
            requestId: request.id,
            swarmServiceId: result.serviceId,
            publishedPort: port,
          },
        });
        this.logger.log(`Swarm service ${result.serviceId} linked to session ${session.id}`);
        return true;
      } catch (err) {
        const transitioned = await this.workspacesService.transitionToFailed(
          session.id,
          (err as Error).message,
        );
        if (!transitioned) throw err;
        if (session.swarmServiceName)
          await this.safeRemoveVolume(this.workspaceVolumeName(session.swarmServiceName));
        await this.audit.record({
          actorUserId: null,
          action: 'workspace-provision-failed',
          targetType: 'workspace',
          targetId: session.id,
          metadata: { requestId: request.id, error: (err as Error).message },
        });
        throw err;
      }
    }
    return false;
  }

  private async convergeStarting(): Promise<void> {
    const startingSessions = await this.workspacesService.findByStatus('starting');
    for (const session of startingSessions) {
      if (!session.swarmServiceId) continue;

      try {
        const tasks = await this.swarmService.inspectServiceTasks(session.swarmServiceId);
        const latestTask = tasks[0];
        if (!latestTask) continue;

        if (latestTask.state === 'running' && latestTask.containerId) {
          const transitioned = await this.workspacesService.transitionToRunning(
            session.id,
            latestTask.taskId,
            latestTask.containerId,
          );
          if (!transitioned) continue;
          if (session.proxyPath && session.publishedPort) {
            await this.safeAddRoute(session.proxyPath, session.publishedPort);
          }
          await this.audit.record({
            actorUserId: null,
            action: 'workspace-running',
            targetType: 'workspace',
            targetId: session.id,
          });
          this.logger.log(`Session ${session.id} is now running`);
        } else if (latestTask.state === 'failed' || latestTask.state === 'rejected') {
          const transitioned = await this.workspacesService.transitionToFailed(
            session.id,
            latestTask.error ?? `Task ${latestTask.state}`,
          );
          if (!transitioned) continue;
          this.logger.warn(`Session ${session.id} failed: ${latestTask.error}`);
          if (session.proxyPath) await this.safeSetInactiveRoute(session.proxyPath);
          await this.safeRemoveService(session.swarmServiceId);
          if (session.swarmServiceName)
            await this.safeRemoveVolume(this.workspaceVolumeName(session.swarmServiceName));
          await this.audit.record({
            actorUserId: null,
            action: 'workspace-task-failed',
            targetType: 'workspace',
            targetId: session.id,
            metadata: { taskState: latestTask.state, error: latestTask.error },
          });
        }
      } catch (err) {
        this.logger.error(`Converge error for session ${session.id}`, (err as Error).message);
      }
    }
  }

  private async expireRunning(
    runningSessions: Awaited<ReturnType<WorkspacesService['findRunning']>>,
  ): Promise<void> {
    const now = new Date();
    for (const session of runningSessions) {
      if (session.expiresAt && session.expiresAt <= now) {
        this.logger.log(`Session ${session.id} expired, stopping...`);
        if (await this.workspacesService.transitionToStopping(session.id, 'expired')) {
          await this.audit.record({
            actorUserId: null,
            action: 'workspace-expired',
            targetType: 'workspace',
            targetId: session.id,
          });
        }
      }
    }
  }

  private async stopIdleRunning(
    runningSessions: Awaited<ReturnType<WorkspacesService['findRunning']>>,
  ): Promise<void> {
    const settings = await this.retention.getSettings();
    if (!settings.idleStopEnabled) return;

    const cutoff = new Date(Date.now() - settings.idleTimeoutMinutes * 60 * 1000);
    for (const session of runningSessions) {
      const lastActivityAt = session.lastActivityAt ?? session.startedAt ?? session.updatedAt;
      if (lastActivityAt > cutoff) continue;
      this.logger.log(
        `Session ${session.id} idle since ${lastActivityAt.toISOString()}, stopping...`,
      );
      if (await this.workspacesService.transitionToStopping(session.id, 'idle_timeout')) {
        await this.audit.record({
          actorUserId: null,
          action: 'workspace-idle-timeout',
          targetType: 'workspace',
          targetId: session.id,
          metadata: {
            idleTimeoutMinutes: settings.idleTimeoutMinutes,
            lastActivityAt: lastActivityAt.toISOString(),
          },
        });
      }
    }
  }

  private async ingestWorkspaceActivity(): Promise<void> {
    try {
      await this.activityLog.ingest();
    } catch (err) {
      this.logger.warn('Failed to ingest Caddy workspace activity logs', (err as Error).message);
    }
  }

  private async stopRequested(): Promise<void> {
    const stoppingSessions = await this.workspacesService.findByStatus('stopping');
    for (const session of stoppingSessions) {
      let cleaned = true;
      if (session.swarmServiceId) {
        cleaned = (await this.safeRemoveService(session.swarmServiceId)) && cleaned;
      }
      if (session.proxyPath)
        cleaned = (await this.safeSetInactiveRoute(session.proxyPath)) && cleaned;
      if (session.swarmServiceName) {
        cleaned =
          (await this.safeRemoveVolume(this.workspaceVolumeName(session.swarmServiceName))) &&
          cleaned;
      }
      if (!cleaned) continue;
      if (
        await this.workspacesService.transitionToStopped(
          session.id,
          session.stopReason ?? 'stopped',
        )
      ) {
        await this.audit.record({
          actorUserId: null,
          action: 'workspace-stopped',
          targetType: 'workspace',
          targetId: session.id,
          metadata: { stopReason: session.stopReason ?? 'stopped' },
        });
      }
    }
  }

  private async recoverStartingServiceIds(): Promise<void> {
    const startingSessions = await this.workspacesService.findByStatus('starting');
    for (const session of startingSessions) {
      if (session.swarmServiceId || !session.swarmServiceName) continue;
      try {
        const serviceId = await this.swarmService.findServiceByName(session.swarmServiceName);
        if (serviceId) await this.workspacesService.setSwarmServiceId(session.id, serviceId);
      } catch (err) {
        this.logger.warn(
          `Failed to recover swarm service id for ${session.id}`,
          (err as Error).message,
        );
      }
    }
  }

  private async repairRunningRoutes(): Promise<void> {
    const runningSessions = await this.workspacesService.findRunning();
    for (const session of runningSessions) {
      if (session.proxyPath && session.publishedPort) {
        await this.safeEnsureRoute(session.proxyPath, session.publishedPort);
      }
    }
  }

  private async removeOrphanServices(): Promise<void> {
    try {
      const liveServiceNames = new Set(await this.workspacesService.listLiveSwarmServiceNames());
      const platformServices = await this.swarmService.listPlatformServices();
      for (const service of platformServices) {
        if (!liveServiceNames.has(service.name)) await this.safeRemoveService(service.id);
      }
    } catch (err) {
      this.logger.warn('Failed to sweep orphan swarm services', (err as Error).message);
    }
  }

  private async removeOrphanRoutes(): Promise<void> {
    try {
      const liveRouteIds = new Set(
        (await this.workspacesService.listLiveProxyPaths()).map((path) =>
          this.caddyService.platformRouteId(path),
        ),
      );
      const routeIds = await this.caddyService.listPlatformRouteIds();
      for (const routeId of routeIds) {
        if (!liveRouteIds.has(routeId)) await this.caddyService.removeRouteById(routeId);
      }
    } catch (err) {
      this.logger.warn('Failed to sweep orphan Caddy routes', (err as Error).message);
    }
  }

  private async removeOrphanVolumes(): Promise<void> {
    try {
      const liveVolumeNames = new Set(
        (await this.workspacesService.listLiveSwarmServiceNames()).map((name) =>
          this.workspaceVolumeName(name),
        ),
      );
      const volumes = await this.swarmService.listPlatformVolumes();
      for (const volume of volumes) {
        if (!liveVolumeNames.has(volume.name)) await this.safeRemoveVolume(volume.name);
      }
    } catch (err) {
      this.logger.warn('Failed to sweep orphan workspace volumes', (err as Error).message);
    }
  }

  private async removeOrphanLegacyVolumes(): Promise<void> {
    try {
      const liveVolumeNames = new Set(
        (await this.workspacesService.listLiveSwarmServiceNames()).map((name) =>
          this.workspaceVolumeName(name),
        ),
      );
      const volumes = await this.swarmService.listLegacyWorkspaceVolumes();
      for (const volume of volumes) {
        if (!liveVolumeNames.has(volume.name)) await this.safeRemoveVolume(volume.name);
      }
    } catch (err) {
      this.logger.warn('Failed to sweep legacy workspace volumes', (err as Error).message);
    }
  }

  private async safeRemoveService(serviceId: string): Promise<boolean> {
    try {
      await this.swarmService.removeService(serviceId);
      return true;
    } catch (err) {
      this.logger.warn(`Failed to remove swarm service ${serviceId}`, (err as Error).message);
      return false;
    }
  }

  private async safeRemoveVolume(volumeName: string): Promise<boolean> {
    try {
      await this.swarmService.removeVolume(volumeName);
      return true;
    } catch (err) {
      this.logger.warn(`Failed to remove workspace volume ${volumeName}`, (err as Error).message);
      return false;
    }
  }

  private async safeAddRoute(proxyPath: string, publishedPort: number): Promise<boolean> {
    try {
      await this.caddyService.ensureRoute(proxyPath, publishedPort);
      return true;
    } catch (err) {
      this.logger.warn(`Failed to add Caddy route ${proxyPath}`, (err as Error).message);
      return false;
    }
  }

  private async safeEnsureRoute(proxyPath: string, publishedPort: number): Promise<boolean> {
    try {
      await this.caddyService.ensureRoute(proxyPath, publishedPort);
      return true;
    } catch (err) {
      this.logger.warn(`Failed to ensure Caddy route ${proxyPath}`, (err as Error).message);
      return false;
    }
  }

  private async safeSetInactiveRoute(proxyPath: string): Promise<boolean> {
    try {
      await this.caddyService.setInactiveRoute(proxyPath);
      return true;
    } catch (err) {
      this.logger.warn(`Failed to set inactive Caddy route ${proxyPath}`, (err as Error).message);
      return false;
    }
  }

  private lockKey(value: string): number {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = (hash * 31 + value.charCodeAt(index)) | 0;
    }
    return hash;
  }

  private workspaceVolumeName(serviceName: string): string {
    return `${serviceName}-data`;
  }
}
