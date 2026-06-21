import { Controller, Get, Query, Res, Session, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AdminGuard } from '@/core/guards/admin.guard';
import { sessionUser, type AppSession } from '@/core/session';
import { renderJsx } from '@/core/render-jsx';
import { GrantsService } from '@/domain/grants/grants.service';
import { AdminDashboardPage } from '@/views/admin/AdminDashboardPage';

@Controller('/admin')
export class AdminDashboardController {
  constructor(private readonly grantsService: GrantsService) {}

  @Get()
  @UseGuards(AdminGuard)
  async index(
    @Session() session: AppSession,
    @Query('page') page = '1',
    @Res() res: Response,
  ): Promise<void> {
    const user = sessionUser(session);
    if (!user) throw new Error('AdminGuard allowed request without session user');
    const parsedPage = Number.parseInt(page, 10);
    const pendingGrants = await this.grantsService.listPendingPage(
      Number.isNaN(parsedPage) ? 1 : parsedPage,
      20,
    );
    renderJsx(res, AdminDashboardPage, { fullName: user.fullName, isAdmin: true, pendingGrants });
  }
}
