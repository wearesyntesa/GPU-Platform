import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DbService } from '@/infrastructure/db/db.service';
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

    let artifact: Awaited<ReturnType<EnvironmentImageBuilderService['buildArtifact']>>;
    try {
      for (const worker of missingWorkers) {
        await this.environments.upsertWorkerImageStatus({
          runtimeImageId: runtime.id,
          workerId: worker.id,
          imageRef: identity.imageRef,
          imageHash: identity.imageHash,
          status: 'building',
        });
      }
      artifact = await this.builder.buildArtifact(runtime);
    } catch (err) {
      const reason = (err as Error).message;
      for (const worker of missingWorkers) {
        await this.environments.upsertWorkerImageStatus({
          runtimeImageId: runtime.id,
          workerId: worker.id,
          imageRef: identity.imageRef,
          imageHash: identity.imageHash,
          status: 'failed',
          failureReason: reason,
        });
      }
      return;
    }

    for (const worker of missingWorkers) {
      try {
        const workerImageId = await this.builder.loadArtifactOnWorker(worker.address, artifact);
        await this.environments.upsertWorkerImageStatus({
          runtimeImageId: runtime.id,
          workerId: worker.id,
          imageRef: artifact.imageRef,
          imageHash: artifact.imageHash,
          imageId: workerImageId || artifact.imageId,
          artifactSha256: artifact.artifactSha256,
          status: 'ready',
          readyAt: new Date(),
        });
      } catch (err) {
        await this.environments.upsertWorkerImageStatus({
          runtimeImageId: runtime.id,
          workerId: worker.id,
          imageRef: artifact.imageRef,
          imageHash: artifact.imageHash,
          artifactSha256: artifact.artifactSha256,
          status: 'failed',
          failureReason: (err as Error).message,
        });
      }
    }
  }
}
