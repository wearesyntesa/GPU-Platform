import { Injectable } from '@nestjs/common';
import { and, eq, isNotNull, not, notInArray, sql } from 'drizzle-orm';
import { runtimeImages, sessions, users, workers } from '@/infrastructure/db/schema';
import { DbService } from '@/infrastructure/db/db.service';
import type { GpuNode } from '@/infrastructure/swarm/swarm.service';

@Injectable()
export class NodesRepository {
  constructor(private readonly dbService: DbService) {}

  async findBySwarmNodeId(swarmNodeId: string): Promise<typeof workers.$inferSelect | null> {
    const rows = await this.dbService.db
      .select()
      .from(workers)
      .where(eq(workers.swarmNodeId, swarmNodeId))
      .limit(1);
    return rows[0] ?? null;
  }

  async upsertGpuNode(node: GpuNode, now: Date): Promise<void> {
    await this.dbService.db
      .insert(workers)
      .values({
        name: `${node.station}-${node.hostname}`,
        swarmNodeId: node.nodeId,
        address: node.address,
        gpuType: node.gpuType,
        gpuCount: node.gpuCount,
        vramGb: node.vramGb,
        cpuTotal: node.cpuTotal,
        memoryTotalGb: node.memoryTotalGb,
        enabled: node.available,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: workers.swarmNodeId,
        set: {
          name: `${node.station}-${node.hostname}`,
          address: node.address,
          gpuType: node.gpuType,
          gpuCount: node.gpuCount,
          vramGb: node.vramGb,
          cpuTotal: node.cpuTotal,
          memoryTotalGb: node.memoryTotalGb,
          enabled: node.available ? workers.enabled : false,
          lastSeenAt: now,
          updatedAt: now,
        },
      });
  }

  async disableMissingSwarmNodes(syncedNodeIds: string[], now: Date): Promise<void> {
    if (syncedNodeIds.length > 0) {
      await this.dbService.db
        .update(workers)
        .set({ enabled: false, updatedAt: now })
        .where(and(isNotNull(workers.swarmNodeId), notInArray(workers.swarmNodeId, syncedNodeIds)));
      return;
    }

    await this.dbService.db
      .update(workers)
      .set({ enabled: false, updatedAt: now })
      .where(isNotNull(workers.swarmNodeId));
  }

  listAll(): Promise<(typeof workers.$inferSelect)[]> {
    return this.dbService.db.select().from(workers).orderBy(workers.name);
  }

  async listWithUsageRows(): Promise<
    {
      worker: typeof workers.$inferSelect;
      workspace: {
        id: string | null;
        status: string | null;
        startedAt: Date | null;
        expiresAt: Date | null;
      } | null;
      requester: { username: string | null } | null;
      environment: { name: string | null } | null;
    }[]
  > {
    return this.dbService.db
      .select({
        worker: workers,
        workspace: {
          id: sessions.id,
          status: sessions.status,
          startedAt: sessions.startedAt,
          expiresAt: sessions.expiresAt,
        },
        requester: { username: users.username },
        environment: { name: runtimeImages.name },
      })
      .from(workers)
      .leftJoin(
        sessions,
        and(
          eq(sessions.workerId, workers.id),
          sql`${sessions.status} in ('starting', 'running', 'stopping')`,
        ),
      )
      .leftJoin(users, eq(sessions.userId, users.id))
      .leftJoin(runtimeImages, eq(sessions.runtimeImageId, runtimeImages.id))
      .orderBy(workers.name);
  }

  async listAvailableGpuTargets(): Promise<string[]> {
    const rows = await this.dbService.db
      .select({ gpuType: workers.gpuType })
      .from(workers)
      .where(and(eq(workers.enabled, true), eq(workers.maintenance, false)))
      .orderBy(workers.gpuType);
    return Array.from(new Set(rows.map((row) => row.gpuType)));
  }

  async toggleEnabled(id: string): Promise<void> {
    await this.dbService.db
      .update(workers)
      .set({ enabled: not(workers.enabled), updatedAt: new Date() })
      .where(eq(workers.id, id));
  }

  async toggleMaintenance(id: string): Promise<void> {
    await this.dbService.db
      .update(workers)
      .set({ maintenance: not(workers.maintenance), updatedAt: new Date() })
      .where(eq(workers.id, id));
  }
}
