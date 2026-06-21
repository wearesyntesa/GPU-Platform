import { describe, expect, it, vi } from 'vitest';
import type { Response, Request } from 'express';
import { RegisterController } from '@/web/auth/register.controller';
import type { PlatformSettingsService } from '@/domain/platform-settings/platform-settings.service';
import type { InvitationsService } from '@/domain/invitations/invitations.service';
import type { UsersService } from '@/domain/users/users.service';
import type { AppSession } from '@/core/session';

vi.mock('@/web/auth/session-promises', () => ({
  regenerateSession: vi.fn().mockResolvedValue(undefined),
  saveSession: vi.fn().mockResolvedValue(undefined),
}));

describe('RegisterController.register', () => {
  it('uses the stored invitation role when creating the user', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'user-1', fullName: 'Admin User', role: 'admin' });
    const consumeToken = vi.fn().mockResolvedValue(undefined);
    const controller = new RegisterController(
      {
        getSettings: vi.fn().mockResolvedValue({ selfRegistrationEnabled: false, requireInvitation: true }),
      } as unknown as PlatformSettingsService,
      {
        findValidByToken: vi.fn().mockResolvedValue({ id: 'invite-1', role: 'admin', email: null }),
        consumeToken,
      } as unknown as InvitationsService,
      { create } as unknown as UsersService,
    );
    const req = { session: {} } as Request & { session: AppSession };
    const res = { redirect: vi.fn() } as unknown as Response;

    await controller.register(
      {
        fullName: 'Admin User',
        email: 'admin@example.test',
        password: 'Password123!',
        confirmPassword: 'Password123!',
        token: 'invite-token',
      },
      req,
      res,
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'admin@example.test', role: 'admin' }),
    );
    expect(consumeToken).toHaveBeenCalledWith('invite-token', 'user-1');
    expect(req.session.role).toBe('admin');
    expect(res.redirect).toHaveBeenCalledWith('/');
  });
});
