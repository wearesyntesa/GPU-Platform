import { Injectable } from '@nestjs/common';
import { and, eq, inArray, not } from 'drizzle-orm';
import { DbService } from '@/infrastructure/db/db.service';
import { runtimeImages, runtimeImageWorkerStatuses, workers } from '@/infrastructure/db/schema';

export type EnvironmentImage = typeof runtimeImages.$inferSelect;
export type RuntimeImageWorkerStatus = typeof runtimeImageWorkerStatuses.$inferSelect;
export type EnvironmentWorker = typeof workers.$inferSelect;

@Injectable()
export class EnvironmentsRepository {
  constructor(private readonly dbService: DbService) {}

  listEnabled(): Promise<EnvironmentImage[]> {
    return this.dbService.db
      .select()
      .from(runtimeImages)
      .where(eq(runtimeImages.enabled, true))
      .orderBy(runtimeImages.name);
  }

  async findById(id: string): Promise<EnvironmentImage | null> {
    const rows = await this.dbService.db
      .select()
      .from(runtimeImages)
      .where(eq(runtimeImages.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  listAll(): Promise<EnvironmentImage[]> {
    return this.dbService.db.select().from(runtimeImages).orderBy(runtimeImages.name);
  }

  listEligibleWorkers(): Promise<EnvironmentWorker[]> {
    return this.dbService.db
      .select()
      .from(workers)
      .where(and(eq(workers.enabled, true), eq(workers.maintenance, false)))
      .orderBy(workers.name);
  }

  async create(data: {
    name: string;
    imageRef: string;
    description?: string | null;
    pythonVersion?: string | null;
    packageManifest?: string;
    enabled?: boolean;
  }): Promise<string> {
    const rows = await this.dbService.db
      .insert(runtimeImages)
      .values({
        name: data.name,
        imageRef: data.imageRef,
        description: data.description ?? null,
        pythonVersion: data.pythonVersion ?? null,
        packageManifest: data.packageManifest ?? '',
        enabled: data.enabled ?? true,
      })
      .returning({ id: runtimeImages.id });
    return rows[0]!.id;
  }

  async update(
    id: string,
    data: {
      name?: string;
      imageRef?: string;
      description?: string | null;
      pythonVersion?: string | null;
      packageManifest?: string;
      enabled?: boolean;
    },
  ): Promise<void> {
    await this.dbService.db
      .update(runtimeImages)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(runtimeImages.id, id));
  }

  async toggleEnabled(id: string): Promise<void> {
    await this.dbService.db
      .update(runtimeImages)
      .set({
        enabled: not(runtimeImages.enabled),
        updatedAt: new Date(),
      })
      .where(eq(runtimeImages.id, id));
  }

  async upsertWorkerImageStatus(data: {
    runtimeImageId: string;
    workerId: string;
    imageRef: string;
    imageHash: string;
    imageId?: string | null;
    status: RuntimeImageWorkerStatus['status'];
    failureReason?: string | null;
    readyAt?: Date | null;
  }): Promise<void> {
    const now = new Date();
    await this.dbService.db
      .insert(runtimeImageWorkerStatuses)
      .values({
        runtimeImageId: data.runtimeImageId,
        workerId: data.workerId,
        imageRef: data.imageRef,
        imageHash: data.imageHash,
        imageId: data.imageId ?? null,
        status: data.status,
        failureReason: data.failureReason ?? null,
        checkedAt: now,
        readyAt: data.readyAt ?? null,
      })
      .onConflictDoUpdate({
        target: [
          runtimeImageWorkerStatuses.runtimeImageId,
          runtimeImageWorkerStatuses.workerId,
          runtimeImageWorkerStatuses.imageHash,
        ],
        set: {
          imageRef: data.imageRef,
          imageId: data.imageId ?? null,
          status: data.status,
          failureReason: data.failureReason ?? null,
          checkedAt: now,
          readyAt: data.readyAt ?? null,
          updatedAt: now,
        },
      });
  }

  async findWorkerImageStatus(data: {
    runtimeImageId: string;
    workerId: string;
    imageHash: string;
  }): Promise<RuntimeImageWorkerStatus | null> {
    const rows = await this.dbService.db
      .select()
      .from(runtimeImageWorkerStatuses)
      .where(
        and(
          eq(runtimeImageWorkerStatuses.runtimeImageId, data.runtimeImageId),
          eq(runtimeImageWorkerStatuses.workerId, data.workerId),
          eq(runtimeImageWorkerStatuses.imageHash, data.imageHash),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async listReadyWorkerIds(runtimeImageId: string, imageHash: string): Promise<string[]> {
    const rows = await this.dbService.db
      .select({ workerId: runtimeImageWorkerStatuses.workerId })
      .from(runtimeImageWorkerStatuses)
      .where(
        and(
          eq(runtimeImageWorkerStatuses.runtimeImageId, runtimeImageId),
          eq(runtimeImageWorkerStatuses.imageHash, imageHash),
          eq(runtimeImageWorkerStatuses.status, 'ready'),
        ),
      );
    return rows.map((row) => row.workerId);
  }

  async resetAllReadyToRebuild(): Promise<void> {
    await this.dbService.db
      .update(runtimeImageWorkerStatuses)
      .set({ status: 'pending', updatedAt: new Date() })
      .where(eq(runtimeImageWorkerStatuses.status, 'ready'));
  }

  async removeStatusesForRemovedWorkers(eligibleWorkerIds: string[]): Promise<void> {
    if (eligibleWorkerIds.length === 0) {
      await this.dbService.db.delete(runtimeImageWorkerStatuses);
      return;
    }
    await this.dbService.db
      .delete(runtimeImageWorkerStatuses)
      .where(not(inArray(runtimeImageWorkerStatuses.workerId, eligibleWorkerIds)));
  }
}
