import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { UserRole } from '@/core/types';
import { UsersService } from '@/domain/users/users.service';
import { PasswordService } from './password.service';

export interface AuthenticatedUser {
  id: string;
  username: string;
  role: UserRole;
  mustChangePassword: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
  ) {}

  async verifyLocalLogin(username: string, password: string): Promise<AuthenticatedUser> {
    const user = await this.users.findActiveByUsername(username);
    if (user && (await this.passwords.verify(user.passwordHash, password))) {
      return {
        id: user.id,
        username: user.username,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      };
    }
    throw new UnauthorizedException('Invalid username or password');
  }
}
