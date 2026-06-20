import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { env } from '@/core/config/env';
import {
  InvitationsRepository,
  UserInvitation,
  InvitationWithCreator,
  UserRole,
} from './invitations.repository';

@Injectable()
export class InvitationsService {
  constructor(private readonly repo: InvitationsRepository) {}

  async createInvitation(
    createdBy: string,
    role: UserRole,
    email?: string,
  ): Promise<{ token: string; url: string; expiresAt: Date }> {
    const token = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.repo.create({
      token,
      email: email ?? null,
      role,
      createdBy,
      expiresAt,
    });

    const url = `${env.appUrl}/register?token=${token}`;
    return { token, url, expiresAt };
  }

  async findValidByToken(token: string): Promise<UserInvitation | null> {
    return this.repo.findByToken(token);
  }

  async findAll(): Promise<InvitationWithCreator[]> {
    return this.repo.findAll();
  }

  async consumeToken(token: string, usedBy: string): Promise<void> {
    const invitation = await this.repo.findByToken(token);
    if (!invitation) {
      throw new NotFoundException('Invitation token is invalid, already used, or expired');
    }
    await this.repo.markUsed(invitation.id, usedBy);
  }

  async revokeInvitation(id: string): Promise<void> {
    await this.repo.revoke(id);
  }
}
