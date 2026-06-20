import { Controller, Get, Res, Session, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@/core/guards/auth.guard';
import { sessionUser, type AppSession } from '@/core/session';
import { renderJsx } from '@/core/render-jsx';
import { HomePage } from '@/views/dashboard/HomePage';
import { LandingPage } from '@/views/landing/LandingPage';
import { PlatformSettingsService } from '@/domain/platform-settings/platform-settings.service';

@Controller()
export class DashboardController {
  constructor(private readonly platformSettings: PlatformSettingsService) {}

  @Get('/')
  async home(@Session() session: AppSession, @Res() res: Response): Promise<void> {
    const user = sessionUser(session);
    if (!user) {
      const settings = await this.platformSettings.getSettings();
      renderJsx(res, LandingPage, { selfRegistrationEnabled: settings.selfRegistrationEnabled });
      return;
    }
    renderJsx(res, HomePage, {
      username: user.username,
      role: user.role,
      isAdmin: user.role === 'admin',
    });
  }
}
