import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DbService } from '@/infrastructure/db/db.service';
import { SwarmService, type SwarmTaskInfo } from '@/infrastructure/swarm/swarm.service';
import {
  EnvironmentsRepository,
  type EnvironmentImage,
  type EnvironmentWorker,
} from './environments.repository';
import {
  EnvironmentImageBuilderService,
  environmentImageIdentity,
  packageLines,
} from './environment-image-builder.service';

@Injectable()
export class EnvironmentImageReadinessService implements OnApplicationBootstrap {
  private readonly logger = new Logger(EnvironmentImageReadinessService.name);
  private reconciling = false;

  constructor(
    private readonly dbService: DbService,
    private readonly environments: EnvironmentsRepository,
    private readonly builder: EnvironmentImageBuilderService,
    private readonly swarm: SwarmService,
  ) {}

  onApplicationBootstrap(): void {
    void this.reconcile();
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async reconcile(): Promise<void> {
    if (this.reconciling) return;
    this.reconciling = true;
    try {
      await this.dbService.withAdvisoryLock(773171002, async () => {
        const [runtimes, workers] = await Promise.all([
          this.environments.listEnabled(),
          this.environments.listEligibleWorkers(),
        ]);
        for (const runtime of runtimes) {
          await this.reconcileRuntime(runtime, workers);
        }
      });
    } catch (err) {
      this.logger.warn('Environment image readiness reconcile failed', (err as Error).message);
    } finally {
      this.reconciling = false;
    }
  }

  async scheduleRuntime(runtimeId: string): Promise<void> {
    const runtime = await this.environments.findById(runtimeId);
    if (!runtime || !runtime.enabled) return;
    await this.reconcileRuntime(runtime, await this.environments.listEligibleWorkers());
  }

  async isReady(runtime: EnvironmentImage, worker: EnvironmentWorker): Promise<string | null> {
    if (packageLines(runtime.packageManifest).length === 0) return runtime.imageRef;
    const identity = environmentImageIdentity(runtime);
    const status = await this.environments.findWorkerImageStatus({
      runtimeImageId: runtime.id,
      workerId: worker.id,
      imageHash: identity.imageHash,
    });
    return status?.status === 'ready' ? status.imageRef : null;
  }

  async listReadyWorkerIds(runtime: EnvironmentImage): Promise<string[]> {
    if (packageLines(runtime.packageManifest).length === 0) {
      return (await this.environments.listEligibleWorkers()).map((worker) => worker.id);
    }
    const identity = environmentImageIdentity(runtime);
    return this.environments.listReadyWorkerIds(runtime.id, identity.imageHash);
  }

  private async reconcileRuntime(
    runtime: EnvironmentImage,
    workers: EnvironmentWorker[],
  ): Promise<void> {
    if (packageLines(runtime.packageManifest).length === 0) return;
    if (workers.length === 0) return;
    const identity = environmentImageIdentity(runtime);
    const missingWorkers = [];
    for (const worker of workers) {
      const status = await this.environments.findWorkerImageStatus({
        runtimeImageId: runtime.id,
        workerId: worker.id,
        imageHash: identity.imageHash,
      });
      if (status?.status !== 'ready') missingWorkers.push(worker);
    }
    if (missingWorkers.length === 0) return;

    const buildSpec = this.builder.buildSpec(runtime);
    for (const worker of missingWorkers) {
      try {
        await this.reconcileWorker(runtime, worker, buildSpec);
      } catch (err) {
        await this.environments.upsertWorkerImageStatus({
          runtimeImageId: runtime.id,
          workerId: worker.id,
          imageRef: buildSpec.imageRef,
          imageHash: buildSpec.imageHash,
          status: 'failed',
          failureReason: (err as Error).message,
        });
      }
    }
  }

  private async reconcileWorker(
    runtime: EnvironmentImage,
    worker: EnvironmentWorker,
    buildSpec: ReturnType<EnvironmentImageBuilderService['buildSpec']>,
  ): Promise<void> {
    if (!worker.swarmNodeId) throw new Error(`Worker ${worker.id} has no Swarm node id`);
    const serviceName = this.builderServiceName(runtime.id, worker.id, buildSpec.imageHash);
    let serviceId = await this.swarm.findServiceByName(serviceName);
    if (!serviceId) {
      const service = await this.swarm.createEnvironmentImageBuildService({
        name: serviceName,
        runtimeImageId: runtime.id,
        workerId: worker.id,
        workerSwarmNodeId: worker.swarmNodeId,
        ...buildSpec,
      });
      serviceId = service.serviceId;
    }

    const tasks = await this.swarm.inspectServiceTasks(serviceId);
    const latestTask = tasks[0];
    if (latestTask && this.isBuildComplete(latestTask)) {
      await this.environments.upsertWorkerImageStatus({
        runtimeImageId: runtime.id,
        workerId: worker.id,
        imageRef: buildSpec.imageRef,
        imageHash: buildSpec.imageHash,
        status: 'ready',
        readyAt: new Date(),
      });
      await this.swarm.removeService(serviceId);
      return;
    }

    if (latestTask && this.isBuildFailed(latestTask)) {
      await this.environments.upsertWorkerImageStatus({
        runtimeImageId: runtime.id,
        workerId: worker.id,
        imageRef: buildSpec.imageRef,
        imageHash: buildSpec.imageHash,
        status: 'failed',
        failureReason: latestTask.error ?? `Builder task ${latestTask.taskId} ended as ${latestTask.state}`,
      });
      await this.swarm.removeService(serviceId);
      return;
    }

    await this.environments.upsertWorkerImageStatus({
      runtimeImageId: runtime.id,
      workerId: worker.id,
      imageRef: buildSpec.imageRef,
      imageHash: buildSpec.imageHash,
      status: 'building',
    });
  }

  private builderServiceName(runtimeId: string, workerId: string, imageHash: string): string {
    return `rpl-env-builder-${runtimeId.slice(0, 8)}-${workerId.slice(0, 8)}-${imageHash.slice(0, 12)}`;
  }

  private isBuildComplete(task: SwarmTaskInfo): boolean {
    return task.state === 'complete';
  }

  private isBuildFailed(task: SwarmTaskInfo): boolean {
    return ['failed', 'rejected', 'shutdown'].includes(task.state);
  }
}
