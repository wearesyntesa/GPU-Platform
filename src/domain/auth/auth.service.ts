import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { UserRole } from '@/core/types';
import { UsersService } from '@/domain/users/users.service';
import { PasswordService } from './password.service';

export interface AuthenticatedUser {
  id: string;
  fullName: string;
  role: UserRole;
  mustChangePassword: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
  ) {}

  async verifyLocalLogin(email: string, password: string): Promise<AuthenticatedUser> {
    const user = await this.users.findActiveByEmail(email);
    if (!user || !(await this.passwords.verify(user.passwordHash, password))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return {
      id: user.id,
      fullName: user.fullName,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };
  }
}
