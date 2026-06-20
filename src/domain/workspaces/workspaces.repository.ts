import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, count, desc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { DbService } from '@/infrastructure/db/db.service';
import {
  runtimeImages,
  sessions,
  sessionRequests,
  users,
  workers,
} from '@/infrastructure/db/schema';
import { isWildcardGpuTarget } from './workspace-targets';

export type WorkspaceSession = typeof sessions.$inferSelect;
export type WorkspaceRequest = typeof sessionRequests.$inferSelect;
export type WorkspaceWorker = typeof workers.$inferSelect;
const liveWorkspaceStatuses: WorkspaceSession['status'][] = ['starting', 'running', 'stopping'];

@Injectable()
export class WorkspacesRepository {
  constructor(private readonly dbService: DbService) {}

  async findActiveByUser(userId: string): Promise<WorkspaceSession | null> {
    const rows = await this.dbService.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, userId), inArray(sessions.status, liveWorkspaceStatuses)))
      .orderBy(sql`${sessions.createdAt} desc`)
      .limit(1);
    return rows[0] ?? null;
  }

  async findById(id: string): Promise<WorkspaceSession | null> {
    const rows = await this.dbService.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  listAll(): Promise<WorkspaceSession[]> {
    return this.dbService.db
      .select()
      .from(sessions)
      .orderBy(sql`${sessions.createdAt} desc`);
  }

  async countAll(): Promise<number> {
    const [totalRow] = await this.dbService.db.select({ value: count() }).from(sessions);
    return totalRow?.value ?? 0;
  }

  async listAdminPage(
    limit: number,
    offset: number,
  ): Promise<
    {
      workspace: WorkspaceSession;
      requester: { username: string };
      environment: { name: string };
    }[]
  > {
    return this.dbService.db
      .select({
        workspace: sessions,
        requester: { username: users.username },
        environment: { name: runtimeImages.name },
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .innerJoin(runtimeImages, eq(sessions.runtimeImageId, runtimeImages.id))
      .orderBy(desc(sessions.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async findApprovedRequestsWithoutSession(): Promise<WorkspaceRequest[]> {
    const result = await this.dbService.db
      .select({ request: sessionRequests })
      .from(sessionRequests)
      .leftJoin(sessions, eq(sessions.requestId, sessionRequests.id))
      .where(and(eq(sessionRequests.status, 'approved'), sql`${sessions.id} IS NULL`));
    return result.map((r) => r.request);
  }

  findByStatus(status: WorkspaceSession['status']): Promise<WorkspaceSession[]> {
    return this.dbService.db.select().from(sessions).where(eq(sessions.status, status));
  }

  findRunning(): Promise<WorkspaceSession[]> {
    return this.dbService.db.select().from(sessions).where(eq(sessions.status, 'running'));
  }

  async markActivity(sessionIds: string[], activityAt = new Date()): Promise<number> {
    const uniqueIds = Array.from(new Set(sessionIds));
    if (uniqueIds.length === 0) return 0;
    const rows = await this.dbService.db
      .update(sessions)
      .set({ lastActivityAt: activityAt, updatedAt: new Date() })
      .where(and(inArray(sessions.id, uniqueIds), eq(sessions.status, 'running')))
      .returning({ id: sessions.id });
    return rows.length;
  }

  async listLiveSwarmServiceNames(): Promise<string[]> {
    const rows = await this.dbService.db
      .select({ name: sessions.swarmServiceName })
      .from(sessions)
      .where(inArray(sessions.status, liveWorkspaceStatuses));
    return rows.map((row) => row.name).filter((name): name is string => name !== null);
  }

  async listLiveProxyPaths(): Promise<string[]> {
    const rows = await this.dbService.db
      .select({ proxyPath: sessions.proxyPath })
      .from(sessions)
      .where(inArray(sessions.status, liveWorkspaceStatuses));
    return rows
      .map((row) => row.proxyPath)
      .filter((proxyPath): proxyPath is string => proxyPath !== null);
  }

  async pickWorker(gpuTarget: string): Promise<WorkspaceWorker | null> {
    const busyWorkers = await this.dbService.db
      .select({ workerId: sessions.workerId })
      .from(sessions)
      .where(inArray(sessions.status, liveWorkspaceStatuses));

    const busyWorkerIds = busyWorkers
      .map((r) => r.workerId)
      .filter((id): id is string => id !== null);
    let condition = and(eq(workers.enabled, true), eq(workers.maintenance, false));

    if (busyWorkerIds.length > 0) condition = and(condition, notInArray(workers.id, busyWorkerIds));
    if (!isWildcardGpuTarget(gpuTarget)) condition = and(condition, eq(workers.gpuType, gpuTarget));

    const rows = await this.dbService.db
      .select()
      .from(workers)
      .where(condition!)
      .orderBy(workers.name)
      .limit(1);
    return rows[0] ?? null;
  }

  async listUsedPorts(): Promise<number[]> {
    const usedPorts = await this.dbService.db
      .select({ port: sessions.publishedPort })
      .from(sessions)
      .where(inArray(sessions.status, liveWorkspaceStatuses));
    return usedPorts.map((r) => r.port).filter((p): p is number => p !== null);
  }

  async createFromApprovedRequest(
    request: WorkspaceRequest,
    worker: WorkspaceWorker,
    port: number,
    tokenHash: string,
  ): Promise<WorkspaceSession> {
    const sessionId = randomUUID();
    const rows = await this.dbService.db
      .insert(sessions)
      .values({
        id: sessionId,
        requestId: request.id,
        userId: request.userId,
        workerId: worker.id,
        runtimeImageId: request.runtimeImageId,
        publishedPort: port,
        jupyterTokenHash: tokenHash,
        swarmServiceName: `rpl-workspace-${sessionId}`,
        proxyPath: `/workspaces/${sessionId}`,
        status: 'starting',
      })
      .returning();
    const session = rows[0];
    if (!session) throw new Error('Session insert failed');
    return session;
  }

  async setSwarmServiceId(sessionId: string, serviceId: string): Promise<boolean> {
    const rows = await this.dbService.db
      .update(sessions)
      .set({ swarmServiceId: serviceId, updatedAt: new Date() })
      .where(eq(sessions.id, sessionId))
      .returning({ id: sessions.id });
    return rows.length > 0;
  }

  async transitionToRunning(
    sessionId: string,
    taskId: string,
    containerId: string,
  ): Promise<boolean> {
    const now = new Date();
    const rows = await this.dbService.db
      .update(sessions)
      .set({
        status: 'running',
        swarmTaskId: taskId,
        containerId,
        startedAt: now,
        lastActivityAt: now,
        updatedAt: now,
      })
      .where(and(eq(sessions.id, sessionId), eq(sessions.status, 'starting')))
      .returning({ id: sessions.id });
    return rows.length > 0;
  }

  async transitionToFailed(sessionId: string, reason: string): Promise<boolean> {
    const now = new Date();
    const rows = await this.dbService.db
      .update(sessions)
      .set({ status: 'failed', failureReason: reason, stoppedAt: now, updatedAt: now })
      .where(
        and(
          eq(sessions.id, sessionId),
          inArray(sessions.status, ['starting', 'running', 'stopping']),
        ),
      )
      .returning({ id: sessions.id });
    return rows.length > 0;
  }

  async transitionToStopped(sessionId: string, reason: string): Promise<boolean> {
    const now = new Date();
    const rows = await this.dbService.db
      .update(sessions)
      .set({ status: 'stopped', stopReason: reason, stoppedAt: now, updatedAt: now })
      .where(and(eq(sessions.id, sessionId), eq(sessions.status, 'stopping')))
      .returning({ id: sessions.id });
    return rows.length > 0;
  }

  async transitionToStopping(sessionId: string, reason: string): Promise<boolean> {
    const rows = await this.dbService.db
      .update(sessions)
      .set({ status: 'stopping', stopReason: reason, updatedAt: new Date() })
      .where(and(eq(sessions.id, sessionId), inArray(sessions.status, ['starting', 'running'])))
      .returning({ id: sessions.id });
    return rows.length > 0;
  }

  async getEnvironmentImage(
    runtimeImageId: string,
  ): Promise<typeof runtimeImages.$inferSelect | null> {
    const rows = await this.dbService.db
      .select()
      .from(runtimeImages)
      .where(eq(runtimeImages.id, runtimeImageId))
      .limit(1);
    return rows[0] ?? null;
  }

  async getRequest(requestId: string): Promise<WorkspaceRequest | null> {
    const rows = await this.dbService.db
      .select()
      .from(sessionRequests)
      .where(eq(sessionRequests.id, requestId))
      .limit(1);
    return rows[0] ?? null;
  }

  async cancelGrantForFailedWorkspace(requestId: string): Promise<void> {
    await this.dbService.db
      .update(sessionRequests)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(and(eq(sessionRequests.id, requestId), eq(sessionRequests.status, 'approved')));
  }
}
