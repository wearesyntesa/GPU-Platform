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

  async onApplicationBootstrap(): Promise<void> {
    await this.environments.resetAllReadyToRebuild();
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
        await this.environments.removeStatusesForRemovedWorkers(workers.map((w) => w.id));
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

  private readonly imageReadinessTtlMs = 4 * 60 * 60 * 1000;
  private readonly failedRetryMs = 30 * 60 * 1000;

  async resetWorkerReadiness(runtimeImageId: string, workerId: string, imageHash: string): Promise<void> {
    await this.environments.upsertWorkerImageStatus({
      runtimeImageId,
      workerId,
      imageRef: 'reset-pending',
      imageHash,
      status: 'pending',
    });
  }

  private async reconcileRuntime(
    runtime: EnvironmentImage,
    workers: EnvironmentWorker[],
  ): Promise<void> {
    if (packageLines(runtime.packageManifest).length === 0) return;
    if (workers.length === 0) return;
    const identity = environmentImageIdentity(runtime);
    const now = Date.now();
    const missingWorkers = [];
    for (const worker of workers) {
      const status = await this.environments.findWorkerImageStatus({
        runtimeImageId: runtime.id,
        workerId: worker.id,
        imageHash: identity.imageHash,
      });
      if (status?.status === 'ready') {
        const age = now - new Date(status.readyAt!).getTime();
        if (age > this.imageReadinessTtlMs) {
          this.logger.log(`Image TTL expired for worker=${worker.id} runtime=${runtime.id}, resetting to pending`);
          await this.environments.upsertWorkerImageStatus({
            runtimeImageId: runtime.id,
            workerId: worker.id,
            imageRef: identity.imageRef,
            imageHash: identity.imageHash,
            status: 'pending',
          });
          missingWorkers.push(worker);
        }
      } else if (status?.status === 'failed') {
        const age = now - new Date(status.updatedAt).getTime();
        if (age > this.failedRetryMs) {
          this.logger.log(`Retrying failed image build for worker=${worker.id} runtime=${runtime.id}`);
          missingWorkers.push(worker);
        }
      } else {
        missingWorkers.push(worker);
      }
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
