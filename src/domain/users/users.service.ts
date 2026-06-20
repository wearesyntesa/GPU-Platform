import { Injectable, ConflictException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { UsersRepository } from './users.repository';
import type { UserRow, UserRole } from './users.repository';
import { PasswordService } from '../auth/password.service';

@Injectable()
export class UsersService {
  constructor(
    private users: UsersRepository,
    private password: PasswordService,
  ) {}

  async findActiveByUsername(username: string): Promise<UserRow | null> {
    return this.users.findActiveByUsername(username);
  }

  async findAll(): Promise<UserRow[]> {
    return this.users.findAll();
  }

  async findById(id: string): Promise<UserRow | null> {
    return this.users.findById(id);
  }

  async create(data: {
    username: string;
    email?: string;
    password: string;
    role?: UserRole;
  }): Promise<UserRow> {
    const passwordHash = await this.password.hash(data.password);
    return this.users.create({
      username: data.username,
      email: data.email ?? null,
      passwordHash,
      role: data.role ?? 'user',
    });
  }

  async disable(id: string): Promise<void> {
    await this.users.updateStatus(id, 'disabled');
  }

  async enable(id: string): Promise<void> {
    await this.users.updateStatus(id, 'active');
  }

  async changeRole(id: string, role: UserRole): Promise<void> {
    await this.users.updateRole(id, role);
  }

  async resetPassword(id: string): Promise<{ user: UserRow; temporaryPassword: string }> {
    const user = await this.findById(id);
    if (!user) throw new Error('User not found');
    const temporaryPassword = this.generateTemporaryPassword();
    const passwordHash = await this.password.hash(temporaryPassword);
    await this.users.updatePassword(id, passwordHash, true);
    await this.users.revokeUserSessions(id);
    return { user, temporaryPassword };
  }

  async changePassword(id: string, password: string): Promise<void> {
    const passwordHash = await this.password.hash(password);
    await this.users.updatePassword(id, passwordHash, false);
  }

  async deleteUser(id: string): Promise<void> {
    const active = await this.users.hasLiveActivity(id);
    if (active) {
      throw new ConflictException('User has active grants or workspaces. Resolve them first.');
    }
    await this.users.delete(id);
  }

  private generateTemporaryPassword(): string {
    return `rpl-${randomBytes(9).toString('base64url').toUpperCase()}`;
  }
}
