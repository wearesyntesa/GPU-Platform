import { Controller, Get, Param, Post, Redirect, Res, Session, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AdminGuard } from '@/core/guards/admin.guard';
import { sessionUser, type AppSession } from '@/core/session';
import { renderJsx } from '@/core/render-jsx';
import { NodesService } from '@/domain/nodes/nodes.service';
import { AuditService } from '@/infrastructure/audit/audit.service';
import { AdminNodesPage } from '@/views/admin/AdminNodesPage';

@Controller('/admin/nodes')
export class AdminNodesController {
  constructor(
    private readonly nodes: NodesService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @UseGuards(AdminGuard)
  async index(@Session() session: AppSession, @Res() res: Response): Promise<void> {
    const user = sessionUser(session);
    if (!user) throw new Error('AdminGuard allowed request without session user');
    const nodeList = await this.nodes.listWithUsage();
    renderJsx(res, AdminNodesPage, { username: user.username, isAdmin: true, nodes: nodeList });
  }

  @Post('/:id/toggle-enabled')
  @UseGuards(AdminGuard)
  @Redirect('/admin/nodes')
  async toggleEnabled(@Session() session: AppSession, @Param('id') id: string): Promise<void> {
    const user = sessionUser(session);
    if (!user) throw new Error('AdminGuard allowed request without session user');
    await this.nodes.toggleEnabled(id);
    await this.audit.record({
      actorUserId: user.id,
      action: 'node-toggle-enabled',
      targetType: 'node',
      targetId: id,
    });
  }

  @Post('/:id/toggle-maintenance')
  @UseGuards(AdminGuard)
  @Redirect('/admin/nodes')
  async toggleMaintenance(@Session() session: AppSession, @Param('id') id: string): Promise<void> {
    const user = sessionUser(session);
    if (!user) throw new Error('AdminGuard allowed request without session user');
    await this.nodes.toggleMaintenance(id);
    await this.audit.record({
      actorUserId: user.id,
      action: 'node-toggle-maintenance',
      targetType: 'node',
      targetId: id,
    });
  }
}
