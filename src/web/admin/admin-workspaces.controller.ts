import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Redirect,
  Res,
  Session,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AdminGuard } from '@/core/guards/admin.guard';
import { sessionUser, type AppSession } from '@/core/session';
import { renderJsx } from '@/core/render-jsx';
import { WorkspacesService } from '@/domain/workspaces/workspaces.service';
import { AuditService } from '@/infrastructure/audit/audit.service';
import { AdminWorkspacesPage } from '@/views/admin/AdminWorkspacesPage';

@Controller('/admin/workspaces')
export class AdminWorkspacesController {
  constructor(
    private readonly workspacesService: WorkspacesService,
    private readonly audit: AuditService,
  ) {}

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
    const workspaces = await this.workspacesService.listAdminPage(
      Number.isNaN(parsedPage) ? 1 : parsedPage,
      20,
    );
    renderJsx(res, AdminWorkspacesPage, { username: user.username, isAdmin: true, workspaces });
  }

  @Post('/:id/stop')
  @UseGuards(AdminGuard)
  @Redirect('/admin/workspaces')
  async stop(@Session() session: AppSession, @Param('id') id: string): Promise<void> {
    const user = sessionUser(session);
    if (!user) throw new Error('AdminGuard allowed request without session user');
    const transitioned = await this.workspacesService.transitionToStopping(id, 'admin_stopped');
    if (transitioned) {
      await this.audit.record({
        actorUserId: user.id,
        action: 'workspace-admin-stop',
        targetType: 'workspace',
        targetId: id,
      });
    }
  }
}
