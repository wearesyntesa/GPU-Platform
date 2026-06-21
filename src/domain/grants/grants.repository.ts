import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { DbService } from '@/infrastructure/db/db.service';
import { runtimeImages, sessionRequests, sessions, users } from '@/infrastructure/db/schema';
import type { AdminGrantsApprovalInput } from './grants.service';

export type Grant = typeof sessionRequests.$inferSelect;
export type PendingGrantRow = {
  grant: Grant;
  user: { fullName: string };
  environment: { name: string };
};
export type ApprovedGrantRow = PendingGrantRow & {
  activeWorkspace: { id: string; status: string } | null;
};

@Injectable()
export class GrantsRepository {
  constructor(private readonly dbService: DbService) {}

  listForUser(userId: string): Promise<Grant[]> {
    return this.dbService.db
      .select()
      .from(sessionRequests)
      .where(eq(sessionRequests.userId, userId))
      .orderBy(desc(sessionRequests.createdAt));
  }

  async countForUser(userId: string): Promise<number> {
    const [row] = await this.dbService.db
      .select({ value: count() })
      .from(sessionRequests)
      .where(eq(sessionRequests.userId, userId));
    return row?.value ?? 0;
  }

  listForUserPage(userId: string, limit: number, offset: number): Promise<Grant[]> {
    return this.dbService.db
      .select()
      .from(sessionRequests)
      .where(eq(sessionRequests.userId, userId))
      .orderBy(desc(sessionRequests.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async countByStatus(status: Grant['status']): Promise<number> {
    const [row] = await this.dbService.db
      .select({ value: count() })
      .from(sessionRequests)
      .where(eq(sessionRequests.status, status));
    return row?.value ?? 0;
  }

  listPending(limit = 20, offset = 0): Promise<PendingGrantRow[]> {
    return this.dbService.db
      .select({
        grant: sessionRequests,
        user: { fullName: users.fullName },
        environment: { name: runtimeImages.name },
      })
      .from(sessionRequests)
      .innerJoin(users, eq(sessionRequests.userId, users.id))
      .innerJoin(runtimeImages, eq(sessionRequests.runtimeImageId, runtimeImages.id))
      .where(eq(sessionRequests.status, 'pending'))
      .orderBy(desc(sessionRequests.createdAt))
      .limit(limit)
      .offset(offset);
  }

  listApproved(limit = 20, offset = 0): Promise<ApprovedGrantRow[]> {
    return this.dbService.db
      .select({
        grant: sessionRequests,
        user: { fullName: users.fullName },
        environment: { name: runtimeImages.name },
        activeWorkspace: { id: sessions.id, status: sessions.status },
      })
      .from(sessionRequests)
      .innerJoin(users, eq(sessionRequests.userId, users.id))
      .innerJoin(runtimeImages, eq(sessionRequests.runtimeImageId, runtimeImages.id))
      .leftJoin(
        sessions,
        and(
          eq(sessions.requestId, sessionRequests.id),
          inArray(sessions.status, ['starting', 'running', 'stopping']),
        ),
      )
      .where(eq(sessionRequests.status, 'approved'))
      .orderBy(desc(sessionRequests.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async findById(id: string): Promise<Grant | null> {
    const rows = await this.dbService.db
      .select()
      .from(sessionRequests)
      .where(eq(sessionRequests.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async findAdminDetailsById(id: string): Promise<{
    grant: Grant;
    user: { fullName: string };
    environment: typeof runtimeImages.$inferSelect;
  } | null> {
    const rows = await this.dbService.db
      .select({
        grant: sessionRequests,
        user: { fullName: users.fullName },
        environment: runtimeImages,
      })
      .from(sessionRequests)
      .innerJoin(users, eq(sessionRequests.userId, users.id))
      .innerJoin(runtimeImages, eq(sessionRequests.runtimeImageId, runtimeImages.id))
      .where(eq(sessionRequests.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async createForUser(data: {
    userId: string;
    runtimeImageId: string;
    gpuTarget: string;
    requestedCpu: number;
    requestedMemoryGb: number;
    purpose?: string | null;
  }): Promise<string> {
    const rows = await this.dbService.db
      .insert(sessionRequests)
      .values({ ...data, purpose: data.purpose?.trim() || null, status: 'pending' })
      .returning({ id: sessionRequests.id });
    const created = rows[0];
    if (!created) throw new Error('Request insert did not return an id');
    return created.id;
  }

  async createChangeRequestForUser(
    supersededRequestId: string,
    data: {
      userId: string;
      runtimeImageId: string;
      gpuTarget: string;
      requestedCpu: number;
      requestedMemoryGb: number;
      purpose?: string | null;
    },
  ): Promise<string | null> {
    return this.dbService.db.transaction(async (tx) => {
      const superseded = await tx
        .update(sessionRequests)
        .set({ status: 'superseded', updatedAt: new Date() })
        .where(
          and(
            eq(sessionRequests.id, supersededRequestId),
            eq(sessionRequests.userId, data.userId),
            eq(sessionRequests.status, 'approved'),
          ),
        )
        .returning({ id: sessionRequests.id });
      if (superseded.length === 0) return null;

      const rows = await tx
        .insert(sessionRequests)
        .values({ ...data, purpose: data.purpose?.trim() || null, status: 'pending' })
        .returning({ id: sessionRequests.id });
      const created = rows[0];
      if (!created) throw new Error('Request insert did not return an id');
      return created.id;
    });
  }

  async findLiveAccessForUser(userId: string): Promise<Grant | null> {
    const rows = await this.dbService.db
      .select()
      .from(sessionRequests)
      .where(
        and(
          eq(sessionRequests.userId, userId),
          inArray(sessionRequests.status, ['pending', 'approved']),
        ),
      )
      .orderBy(desc(sessionRequests.createdAt))
      .limit(1);
    return rows[0] ?? null;
  }

  async approvePending(id: string, adminUserId: string, reason: string | null): Promise<boolean> {
    const rows = await this.dbService.db
      .update(sessionRequests)
      .set({
        status: 'approved',
        decisionReason: reason,
        decidedBy: adminUserId,
        decidedAt: new Date(),
      })
      .where(and(eq(sessionRequests.id, id), eq(sessionRequests.status, 'pending')))
      .returning({ id: sessionRequests.id });
    return rows.length > 0;
  }

  async approvePendingWithAdjustments(
    id: string,
    adminUserId: string,
    input: AdminGrantsApprovalInput,
  ): Promise<boolean> {
    const rows = await this.dbService.db
      .update(sessionRequests)
      .set({
        runtimeImageId: input.runtimeImageId,
        gpuTarget: input.gpuTarget.trim() || 'auto',
        requestedCpu: input.requestedCpu,
        requestedMemoryGb: input.requestedMemoryGb,
        status: 'approved',
        decisionReason: input.reason,
        decidedBy: adminUserId,
        decidedAt: new Date(),
      })
      .where(and(eq(sessionRequests.id, id), eq(sessionRequests.status, 'pending')))
      .returning({ id: sessionRequests.id });
    return rows.length > 0;
  }

  async hasLiveAccessForUser(userId: string): Promise<boolean> {
    const [row] = await this.dbService.db
      .select({ value: count() })
      .from(sessionRequests)
      .where(
        and(
          eq(sessionRequests.userId, userId),
          inArray(sessionRequests.status, ['pending', 'approved']),
        ),
      );
    return (row?.value ?? 0) > 0;
  }

  async hasOtherLiveAccessForUser(userId: string, requestId: string): Promise<boolean> {
    const [row] = await this.dbService.db
      .select({ value: count() })
      .from(sessionRequests)
      .where(
        and(
          eq(sessionRequests.userId, userId),
          inArray(sessionRequests.status, ['pending', 'approved']),
          sql`${sessionRequests.id} <> ${requestId}`,
        ),
      );
    return (row?.value ?? 0) > 0;
  }

  async rejectPending(id: string, adminUserId: string, reason: string): Promise<boolean> {
    const rows = await this.dbService.db
      .update(sessionRequests)
      .set({
        status: 'rejected',
        decisionReason: reason,
        decidedBy: adminUserId,
        decidedAt: new Date(),
      })
      .where(and(eq(sessionRequests.id, id), eq(sessionRequests.status, 'pending')))
      .returning({ id: sessionRequests.id });
    return rows.length > 0;
  }

  async cancelPendingForUser(id: string, userId: string): Promise<boolean> {
    const rows = await this.dbService.db
      .update(sessionRequests)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(
        and(
          eq(sessionRequests.id, id),
          eq(sessionRequests.userId, userId),
          eq(sessionRequests.status, 'pending'),
        ),
      )
      .returning({ id: sessionRequests.id });
    return rows.length > 0;
  }

  async findLiveWorkspaceForGrant(id: string): Promise<{ id: string } | null> {
    const [liveSession] = await this.dbService.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.requestId, id),
          inArray(sessions.status, ['starting', 'running', 'stopping']),
        ),
      )
      .limit(1);
    return liveSession ?? null;
  }

  async revokeApproved(id: string, adminUserId: string): Promise<boolean> {
    const rows = await this.dbService.db
      .update(sessionRequests)
      .set({
        status: 'cancelled',
        decisionReason: 'Revoked by admin',
        decidedBy: adminUserId,
        decidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(sessionRequests.id, id), eq(sessionRequests.status, 'approved')))
      .returning({ id: sessionRequests.id });
    return rows.length > 0;
  }
}
