import { Injectable } from '@nestjs/common';
import { DbService } from '@/infrastructure/db/db.service';
import { userInvitations, users } from '@/infrastructure/db/schema';
import { eq, sql } from 'drizzle-orm';

export type UserRole = 'user' | 'admin';

export interface UserInvitation {
  id: string;
  token: string;
  email: string | null;
  role: UserRole;
  usedAt: Date | null;
  usedBy: string | null;
  expiresAt: Date;
  createdBy: string;
  createdAt: Date;
}

export interface InvitationWithCreator extends UserInvitation {
  createdByUsername: string | null;
}

@Injectable()
export class InvitationsRepository {
  constructor(private readonly db: DbService) {}

  async findByToken(token: string): Promise<UserInvitation | null> {
    const result = await this.db.db
      .select()
      .from(userInvitations)
      .where(
        sql`${userInvitations.token} = ${token}
          AND ${userInvitations.usedAt} IS NULL
          AND ${userInvitations.expiresAt} > NOW()`,
      )
      .limit(1);

    if (result.length === 0) return null;
    return result[0] as UserInvitation;
  }

  async findAll(): Promise<InvitationWithCreator[]> {
    const result = await this.db.db
      .select({
        id: userInvitations.id,
        token: userInvitations.token,
        email: userInvitations.email,
        role: userInvitations.role,
        usedAt: userInvitations.usedAt,
        usedBy: userInvitations.usedBy,
        expiresAt: userInvitations.expiresAt,
        createdBy: userInvitations.createdBy,
        createdAt: userInvitations.createdAt,
        createdByUsername: users.fullName,
      })
      .from(userInvitations)
      .leftJoin(users, eq(userInvitations.createdBy, users.id));

    return result as InvitationWithCreator[];
  }

  async create(data: {
    token: string;
    email: string | null;
    role: UserRole;
    createdBy: string;
    expiresAt: Date;
  }): Promise<UserInvitation> {
    const id = crypto.randomUUID();
    const result = await this.db.db
      .insert(userInvitations)
      .values({
        id,
        token: data.token,
        email: data.email,
        role: data.role,
        createdBy: data.createdBy,
        expiresAt: data.expiresAt,
        createdAt: new Date(),
      })
      .returning();

    return result[0] as UserInvitation;
  }

  async markUsed(id: string, usedBy: string): Promise<void> {
    await this.db.db
      .update(userInvitations)
      .set({
        usedAt: new Date(),
        usedBy,
      })
      .where(eq(userInvitations.id, id));
  }

  async revoke(id: string): Promise<void> {
    await this.db.db
      .update(userInvitations)
      .set({ expiresAt: new Date() })
      .where(eq(userInvitations.id, id));
  }
}
