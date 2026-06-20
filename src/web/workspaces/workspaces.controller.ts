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
import { AuthGuard } from '@/core/guards/auth.guard';
import { sessionUser, type AppSession } from '@/core/session';
import { renderJsx } from '@/core/render-jsx';
import { WorkspacesService } from '@/domain/workspaces/workspaces.service';
import { WorkspacesReconcilerService } from '@/domain/workspaces/workspaces-reconciler.service';
import { AuditService } from '@/infrastructure/audit/audit.service';
import { env } from '@/core/config/env';
import { ActiveWorkspacePage } from '@/views/workspaces/ActiveWorkspacePage';
import { InactiveWorkspacePage } from '@/views/workspaces/InactiveWorkspacePage';

@Controller('/workspaces')
export class WorkspacesController {
  constructor(
    private readonly workspacesService: WorkspacesService,
    private readonly workspacesReconciler: WorkspacesReconcilerService,
    private readonly audit: AuditService,
  ) {}

  @Get('/active')
  @UseGuards(AuthGuard)
  async active(
    @Res() res: Response,
    @Session() session: AppSession,
    @Query('message') message?: string,
  ): Promise<void> {
    const user = sessionUser(session);
    if (!user) throw new Error('AuthGuard allowed request without session user');

    const activeWorkspace = await this.workspacesService.findActiveByUser(user.id);

    let workspaceUrl: string | null = null;
    if (activeWorkspace?.status === 'running' && activeWorkspace.publishedPort) {
      const token = this.workspacesService.buildJupyterToken(activeWorkspace.requestId);
      workspaceUrl = `${env.caddyPublicUrl}${activeWorkspace.proxyPath}/lab?token=${token}`;
    }

    renderJsx(res, ActiveWorkspacePage, {
      username: user.username,
      isAdmin: user.role === 'admin',
      activeWorkspace,
      workspaceUrl,
      message: this.workspaceMessage(message),
    });
  }

  private workspaceMessage(message?: string): string | null {
    if (message === 'no-capacity') return 'No GPU node is available right now. Try again later.';
    if (message === 'already-active') return 'You already have a running or starting workspace.';
    if (message === 'start-in-progress')
      return 'Your workspace is being started. Please wait a moment.';
    return null;
  }

  @Post('/start/:grantId')
  @UseGuards(AuthGuard)
  async start(
    @Session() appSession: AppSession,
    @Param('grantId') grantId: string,
    @Res() res: Response,
  ): Promise<void> {
    const user = sessionUser(appSession);
    if (!user) {
      res.redirect('/login');
      return;
    }

    const result = await this.workspacesReconciler.startApprovedRequest(grantId, user.id);
    if (result === 'no-capacity') {
      res.redirect('/workspaces/active?message=no-capacity');
      return;
    }
    if (result === 'already-active') {
      res.redirect('/workspaces/active?message=already-active');
      return;
    }
    if (result === 'start-in-progress') {
      res.redirect('/workspaces/active?message=start-in-progress');
      return;
    }
    if (result === 'not-found') {
      res.redirect('/grants?message=grant-not-found');
      return;
    }

    res.redirect('/workspaces/active');
  }

  @Get('/status/:id')
  @UseGuards(AuthGuard)
  async status(
    @Session() appSession: AppSession,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const user = sessionUser(appSession);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const sess = await this.workspacesService.findById(id);
    if (!sess || sess.userId !== user.id) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }

    let workspaceUrl: string | null = null;
    if (sess.status === 'running' && sess.publishedPort) {
      const token = this.workspacesService.buildJupyterToken(sess.requestId);
      workspaceUrl = `${env.caddyPublicUrl}${sess.proxyPath}/lab?token=${token}`;
    }

    res.json({
      id: sess.id,
      status: sess.status,
      workspaceUrl,
      failureReason: sess.failureReason,
      startedAt: sess.startedAt,
      expiresAt: sess.expiresAt,
    });
  }

  @Post('/stop/:id')
  @UseGuards(AuthGuard)
  @Redirect('/workspaces/active')
  async stop(@Session() appSession: AppSession, @Param('id') id: string): Promise<void> {
    const user = sessionUser(appSession);
    if (!user) throw new Error('AuthGuard allowed request without session user');

    const sess = await this.workspacesService.findById(id);
    if (!sess || sess.userId !== user.id) return;

    if (sess.status === 'starting' || sess.status === 'running') {
      const transitioned = await this.workspacesService.transitionToStopping(
        sess.id,
        'user_stopped',
      );
      if (transitioned) {
        await this.audit.record({
          actorUserId: user.id,
          action: 'workspace-user-stop',
          targetType: 'workspace',
          targetId: sess.id,
        });
      }
    }
  }

  @Get('/:id/lab')
  @UseGuards(AuthGuard)
  async inactiveLab(
    @Session() appSession: AppSession,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const user = sessionUser(appSession);
    if (!user) {
      res.redirect('/login');
      return;
    }

    const sess = await this.workspacesService.findById(id);
    if (!sess || sess.userId !== user.id) {
      res.status(404).send('Workspace not found');
      return;
    }

    if (sess.status === 'running' && sess.publishedPort) {
      const token = this.workspacesService.buildJupyterToken(sess.requestId);
      res.redirect(`${env.caddyPublicUrl}${sess.proxyPath}/lab?token=${token}`);
      return;
    }

    renderJsx(res.status(410), InactiveWorkspacePage, {
      username: user.username,
      isAdmin: user.role === 'admin',
      workspace: {
        id: sess.id,
        status: sess.status,
        stopReason: sess.stopReason,
        stoppedAt: sess.stoppedAt,
        failureReason: sess.failureReason,
      },
    });
  }
}
