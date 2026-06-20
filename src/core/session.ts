import type { Request } from 'express';
import type { UserRole } from '@/core/types';

export type AppSession = Request['session'] & {
  userId?: string;
  username?: string;
  role?: UserRole;
  mustChangePassword?: boolean;
  csrfToken?: string;
};

export interface SessionUser {
  id: string;
  username: string;
  role: UserRole;
  mustChangePassword: boolean;
}

export function sessionUser(session: AppSession): SessionUser | null {
  if (!session.userId || !session.username || !session.role) return null;
  return {
    id: session.userId,
    username: session.username,
    role: session.role,
    mustChangePassword: session.mustChangePassword ?? false,
  };
}
