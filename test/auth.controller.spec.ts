import { describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { AuthController } from '@/web/auth/auth.controller';
import type { AppSession } from '@/core/session';
import type { AuthService } from '@/domain/auth/auth.service';
import type { PlatformSettingsService } from '@/domain/platform-settings/platform-settings.service';
import type { UsersService } from '@/domain/users/users.service';

const mockPlatformSettings = {
  getSettings: vi
    .fn()
    .mockResolvedValue({ selfRegistrationEnabled: false, requireInvitation: true }),
} as unknown as PlatformSettingsService;

describe('AuthController.logout', () => {
  it('redirects to login when session destroy succeeds', async () => {
    const controller = new AuthController({} as AuthService, {} as UsersService, mockPlatformSettings);
    const session = {
      destroy: (callback: (err?: Error) => void) => callback(),
    } as AppSession;
    const response = { redirect: vi.fn() } as unknown as Response;

    await controller.logout(session, response);

    expect(response.redirect).toHaveBeenCalledWith('/login');
  });

  it('still redirects when session destroy fails', async () => {
    const controller = new AuthController({} as AuthService, {} as UsersService, mockPlatformSettings);
    const session = {
      destroy: (callback: (err?: Error) => void) => callback(new Error('store down')),
    } as AppSession;
    const response = { redirect: vi.fn() } as unknown as Response;

    await controller.logout(session, response);

    expect(response.redirect).toHaveBeenCalledWith('/login');
  });
});
