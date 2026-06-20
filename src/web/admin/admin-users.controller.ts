import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  Session,
  UseGuards,
  ConflictException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { AdminGuard } from '@/core/guards/admin.guard';
import { sessionUser, type AppSession } from '@/core/session';
import { renderJsx } from '@/core/render-jsx';
import { UsersService } from '@/domain/users/users.service';
import { InvitationsService } from '@/domain/invitations/invitations.service';
import { AuditService } from '@/infrastructure/audit/audit.service';
import { env } from '@/core/config/env';
import { AdminUsersPage } from '@/views/admin/AdminUsersPage';
import { AdminUserFormPage } from '@/views/admin/AdminUserFormPage';
import { AdminUserInvitePage } from '@/views/admin/AdminUserInvitePage';
import type { UserRole } from '@/domain/users/users.repository';

@Controller('/admin/users')
@UseGuards(AdminGuard)
export class AdminUsersController {
  private readonly logger = new Logger(AdminUsersController.name);

  constructor(
    private readonly users: UsersService,
    private readonly invitations: InvitationsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async index(
    @Session() session: AppSession,
    @Res() res: Response,
    @Query('message') message?: string,
  ): Promise<void> {
    const user = sessionUser(session);
    if (!user) throw new Error('AdminGuard allowed request without session user');
    const allUsers = await this.users.findAll();
    renderJsx(res, AdminUsersPage, {
      username: user.username,
      isAdmin: true,
      users: allUsers,
      message: message ?? null,
    });
  }

  @Get('/new')
  newUserPage(@Session() session: AppSession, @Res() res: Response): void {
    const user = sessionUser(session);
    if (!user) throw new Error('AdminGuard allowed request without session user');
    renderJsx(res, AdminUserFormPage, {
      username: user.username,
      isAdmin: true,
    });
  }

  @Post()
  async createUser(
    @Session() session: AppSession,
    @Body('username') username: string,
    @Body('email') email: string,
    @Body('password') password: string,
    @Body('role') role: string,
    @Res() res: Response,
  ): Promise<void> {
    const actor = sessionUser(session);
    if (!actor) throw new Error('AdminGuard allowed request without session user');

    try {
      const newUser = await this.users.create({
        username,
        email: email || undefined,
        password,
        role: (role as UserRole) || 'user',
      });
      await this.audit.record({
        actorUserId: actor.id,
        action: 'user-create',
        targetType: 'user',
        targetId: newUser.id,
        metadata: { username: newUser.username, role: newUser.role },
      });
      res.redirect('/admin/users');
    } catch (err) {
      if (err instanceof ConflictException) {
        renderJsx(res.status(409), AdminUserFormPage, {
          username: actor.username,
          isAdmin: true,
          error: 'Username is already taken.',
        });
        return;
      }
      throw err;
    }
  }

  @Get('/invite')
  async invitePage(@Session() session: AppSession, @Res() res: Response): Promise<void> {
    const user = sessionUser(session);
    if (!user) throw new Error('AdminGuard allowed request without session user');
    const allInvitations = await this.invitations.findAll();
    renderJsx(res, AdminUserInvitePage, {
      username: user.username,
      isAdmin: true,
      invitations: allInvitations,
      appUrl: env.appUrl,
    });
  }

  @Post('/invite')
  async createInvite(
    @Session() session: AppSession,
    @Body('email') email: string,
    @Body('role') role: string,
    @Res() res: Response,
  ): Promise<void> {
    const user = sessionUser(session);
    if (!user) throw new Error('AdminGuard allowed request without session user');

    try {
      const { url, expiresAt } = await this.invitations.createInvitation(
        user.id,
        (role as UserRole) || 'user',
        email || undefined,
      );
      const allInvitations = await this.invitations.findAll();
      renderJsx(res, AdminUserInvitePage, {
        username: user.username,
        isAdmin: true,
        invitations: allInvitations,
        newInviteUrl: url,
        newInviteExpiresAt: expiresAt,
        appUrl: env.appUrl,
      });
    } catch (err) {
      const allInvitations = await this.invitations.findAll();
      renderJsx(res.status(500), AdminUserInvitePage, {
        username: user.username,
        isAdmin: true,
        invitations: allInvitations,
        error: (err as Error).message,
        appUrl: env.appUrl,
      });
    }
  }

  @Post('/:id/disable')
  async disableUser(
    @Session() session: AppSession,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const actor = sessionUser(session);
    if (!actor) throw new Error('AdminGuard allowed request without session user');
    await this.users.disable(id);
    await this.audit.record({
      actorUserId: actor.id,
      action: 'user-disable',
      targetType: 'user',
      targetId: id,
    });
    res.redirect('/admin/users');
  }

  @Post('/:id/enable')
  async enableUser(
    @Session() session: AppSession,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const actor = sessionUser(session);
    if (!actor) throw new Error('AdminGuard allowed request without session user');
    await this.users.enable(id);
    res.redirect('/admin/users');
  }

  @Post('/:id/role')
  async changeRole(
    @Session() session: AppSession,
    @Param('id') id: string,
    @Body('role') role: string,
    @Res() res: Response,
  ): Promise<void> {
    const actor = sessionUser(session);
    if (!actor) throw new Error('AdminGuard allowed request without session user');
    await this.users.changeRole(id, role as UserRole);
    await this.audit.record({
      actorUserId: actor.id,
      action: 'user-role-change',
      targetType: 'user',
      targetId: id,
      metadata: { newRole: role },
    });
    res.redirect('/admin/users');
  }

  @Post('/:id/reset-password')
  async resetPassword(
    @Session() session: AppSession,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const actor = sessionUser(session);
    if (!actor) throw new Error('AdminGuard allowed request without session user');

    const { user, temporaryPassword } = await this.users.resetPassword(id);
    await this.audit.record({
      actorUserId: actor.id,
      action: 'admin-password-reset',
      targetType: 'user',
      targetId: id,
      metadata: { username: user.username },
    });

    const allUsers = await this.users.findAll();
    renderJsx(res, AdminUsersPage, {
      username: actor.username,
      isAdmin: true,
      users: allUsers,
      message: 'Temporary password generated. Share it securely with the user.',
      temporaryPassword: { username: user.username, password: temporaryPassword },
    });
  }

  @Post('/:id/delete')
  async deleteUser(
    @Session() session: AppSession,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const actor = sessionUser(session);
    if (!actor) throw new Error('AdminGuard allowed request without session user');
    try {
      await this.users.deleteUser(id);
      await this.audit.record({
        actorUserId: actor.id,
        action: 'user-delete',
        targetType: 'user',
        targetId: id,
      });
      res.redirect('/admin/users');
    } catch (err) {
      if (err instanceof ConflictException) {
        res.redirect(
          `/admin/users?message=${encodeURIComponent((err as ConflictException).message)}`,
        );
        return;
      }
      throw err;
    }
  }

  @Post('/invite/:id/revoke')
  async revokeInvite(
    @Session() session: AppSession,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const user = sessionUser(session);
    if (!user) throw new Error('AdminGuard allowed request without session user');
    await this.invitations.revokeInvitation(id);
    res.redirect('/admin/users/invite');
  }
}
