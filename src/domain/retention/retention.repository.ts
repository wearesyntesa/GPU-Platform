import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DbService } from '@/infrastructure/db/db.service';
import {
  auditLogs,
  retentionSettings,
  sessionRequests,
  sessions,
} from '@/infrastructure/db/schema';
import type { RetentionSettingsValue } from './retention.service';

@Injectable()
export class RetentionRepository {
  constructor(private readonly dbService: DbService) {}

  async getSettings(): Promise<RetentionSettingsValue | null> {
    const rows = await this.dbService.db
      .select()
      .from(retentionSettings)
      .where(eq(retentionSettings.id, 'settings'))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      enabled: row.enabled,
      auditLogDays: row.auditLogDays,
      workspaceDays: row.workspaceDays,
      accessRequestDays: row.accessRequestDays,
      idleStopEnabled: row.idleStopEnabled,
      idleTimeoutMinutes: row.idleTimeoutMinutes,
      batchSize: row.batchSize,
    };
  }

  async saveSettings(settings: RetentionSettingsValue, updatedBy: string): Promise<void> {
    await this.dbService.db
      .insert(retentionSettings)
      .values({ id: 'settings', ...settings, updatedBy, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: retentionSettings.id,
        set: { ...settings, updatedBy, updatedAt: new Date() },
      });
  }

  async countAuditLogs(days: number): Promise<number> {
    const [row] = await this.dbService.db
      .select({ value: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(sql`${auditLogs.createdAt} < now() - (${days} * interval '1 day')`);
    return row?.value ?? 0;
  }

  async countTerminalWorkspaces(days: number): Promise<number> {
    const [row] = await this.dbService.db
      .select({ value: sql<number>`count(*)::int` })
      .from(sessions)
      .where(
        sql`${sessions.status} in ('stopped', 'failed', 'expired') and ${sessions.updatedAt} < now() - (${days} * interval '1 day')`,
      );
    return row?.value ?? 0;
  }

  async countTerminalAccessRequests(days: number): Promise<number> {
    const [row] = await this.dbService.db
      .select({ value: sql<number>`count(*)::int` })
      .from(sessionRequests)
      .where(
        sql`${sessionRequests.status} in ('cancelled', 'rejected', 'expired') and ${sessionRequests.updatedAt} < now() - (${days} * interval '1 day') and not exists (select 1 from ${sessions} where ${sessions.requestId} = ${sessionRequests.id})`,
      );
    return row?.value ?? 0;
  }

  async countExpiredUserSessions(): Promise<number> {
    const result = await this.dbService.db.execute(
      sql`select count(*)::int as count from user_sessions where expire < now()`,
    );
    return Number((result.rows[0] as { count?: unknown } | undefined)?.count ?? 0);
  }
}
