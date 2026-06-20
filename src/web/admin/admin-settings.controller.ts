import { Body, Controller, Get, Post, Query, Res, Session, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AdminGuard } from '@/core/guards/admin.guard';
import { sessionUser, type AppSession } from '@/core/session';
import { renderJsx } from '@/core/render-jsx';
import { PlatformSettingsService } from '@/domain/platform-settings/platform-settings.service';
import { AuditService } from '@/infrastructure/audit/audit.service';
import { AdminSettingsPage } from '@/views/admin/AdminSettingsPage';

function positiveInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

@Controller('/admin/settings')
@UseGuards(AdminGuard)
export class AdminSettingsController {
  constructor(
    private readonly platformSettings: PlatformSettingsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async index(
    @Session() session: AppSession,
    @Res() res: Response,
    @Query('saved') saved?: string,
  ): Promise<void> {
    const user = sessionUser(session);
    if (!user) throw new Error('AdminGuard allowed request without session user');
    const settings = await this.platformSettings.getSettings();
    renderJsx(res, AdminSettingsPage, {
      username: user.username,
      isAdmin: true,
      settings,
      message: saved === '1' ? 'Settings saved.' : null,
    });
  }

  @Post()
  async save(
    @Session() session: AppSession,
    @Body('selfRegistrationEnabled') selfRegistrationEnabled: string,
    @Body('requireInvitation') requireInvitation: string,
    @Body('maxRequestCpu') maxRequestCpu: string,
    @Body('maxRequestMemoryGb') maxRequestMemoryGb: string,
    @Res() res: Response,
  ): Promise<void> {
    const user = sessionUser(session);
    if (!user) throw new Error('AdminGuard allowed request without session user');

    const settings = {
      selfRegistrationEnabled: selfRegistrationEnabled === 'on',
      requireInvitation: requireInvitation === 'on',
      maxRequestCpu: positiveInteger(maxRequestCpu, 128),
      maxRequestMemoryGb: positiveInteger(maxRequestMemoryGb, 1024),
    };

    await this.platformSettings.saveSettings(settings, user.id);
    await this.audit.record({
      actorUserId: user.id,
      action: 'platform-settings-update',
      targetType: 'platform-settings',
      targetId: 'settings',
      metadata: {
        selfRegistrationEnabled: settings.selfRegistrationEnabled,
        requireInvitation: settings.requireInvitation,
        maxRequestCpu: settings.maxRequestCpu,
        maxRequestMemoryGb: settings.maxRequestMemoryGb,
      },
    });

    res.redirect('/admin/settings?saved=1');
  }
}
