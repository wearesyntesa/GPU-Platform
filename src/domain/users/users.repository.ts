import { Injectable } from '@nestjs/common';
import { and, eq, inArray, count, sql } from 'drizzle-orm';
import { DbService } from '@/infrastructure/db/db.service';
import { users, sessionRequests, sessions } from '@/infrastructure/db/schema';

export type UserRow = typeof users.$inferSelect;
export type UserRole = 'user' | 'admin';

@Injectable()
export class UsersRepository {
  constructor(private readonly dbService: DbService) {}

  async findActiveByUsername(username: string): Promise<UserRow | null> {
    const rows = await this.dbService.db
      .select()
      .from(users)
      .where(and(eq(users.username, username), eq(users.status, 'active')))
      .limit(1);
    return rows[0] ?? null;
  }

  async findAll(): Promise<UserRow[]> {
    return this.dbService.db.select().from(users).orderBy(users.createdAt);
  }

  async findById(id: string): Promise<UserRow | null> {
    const rows = await this.dbService.db.select().from(users).where(eq(users.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async create(data: {
    username: string;
    email: string | null;
    passwordHash: string;
    role: UserRole;
  }): Promise<UserRow> {
    const rows = await this.dbService.db.insert(users).values(data).returning();
    if (!rows[0]) throw new Error('User insert returned no row');
    return rows[0];
  }

  async updateStatus(id: string, status: 'active' | 'disabled'): Promise<void> {
    await this.dbService.db.update(users).set({ status }).where(eq(users.id, id));
  }

  async updateRole(id: string, role: UserRole): Promise<void> {
    await this.dbService.db.update(users).set({ role }).where(eq(users.id, id));
  }

  async updatePassword(id: string, passwordHash: string, mustChangePassword: boolean): Promise<void> {
    await this.dbService.db
      .update(users)
      .set({ passwordHash, mustChangePassword })
      .where(eq(users.id, id));
  }

  async revokeUserSessions(id: string): Promise<void> {
    await this.dbService.db.execute(
      sql`delete from user_sessions where sess->>'userId' = ${id}`,
    );
  }

  async delete(id: string): Promise<void> {
    await this.dbService.db.delete(users).where(eq(users.id, id));
  }

  async hasLiveActivity(id: string): Promise<boolean> {
    const [grantResult] = await this.dbService.db
      .select({ value: count() })
      .from(sessionRequests)
      .where(
        and(
          eq(sessionRequests.userId, id),
          inArray(sessionRequests.status, ['pending', 'approved']),
        ),
      );

    if ((grantResult?.value ?? 0) > 0) return true;

    const [sessionResult] = await this.dbService.db
      .select({ value: count() })
      .from(sessions)
      .where(
        and(eq(sessions.userId, id), inArray(sessions.status, ['starting', 'running', 'stopping'])),
      );

    return (sessionResult?.value ?? 0) > 0;
  }
}
