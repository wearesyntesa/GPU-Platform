import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  Logger,
  ConflictException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PlatformSettingsService } from '@/domain/platform-settings/platform-settings.service';
import { InvitationsService } from '@/domain/invitations/invitations.service';
import { UsersService } from '@/domain/users/users.service';
import type { AppSession } from '@/core/session';
import { renderJsx } from '@/core/render-jsx';
import { RegisterPage } from '@/views/auth/RegisterPage';
import { RegisterDto } from './register.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { regenerateSession, saveSession } from './session-promises';

@Controller()
export class RegisterController {
  private readonly logger = new Logger(RegisterController.name);

  constructor(
    private readonly platformSettings: PlatformSettingsService,
    private readonly invitations: InvitationsService,
    private readonly users: UsersService,
  ) {}

  @Get('/register')
  async registerPage(@Res() res: Response, @Query('token') token?: string): Promise<void> {
    const settings = await this.platformSettings.getSettings();

    if (token) {
      const invitation = await this.invitations.findValidByToken(token);
      if (!invitation) {
        renderJsx(res, RegisterPage, { tokenInvalid: true });
        return;
      }
      renderJsx(res, RegisterPage, {
        selfRegistrationEnabled: settings.selfRegistrationEnabled,
        requireInvitation: settings.requireInvitation,
        token,
        email: invitation.email ?? undefined,
      });
      return;
    }

    if (!settings.selfRegistrationEnabled) {
      renderJsx(res, RegisterPage, {
        selfRegistrationEnabled: false,
        requireInvitation: settings.requireInvitation,
      });
      return;
    }

    renderJsx(res, RegisterPage, {
      selfRegistrationEnabled: settings.selfRegistrationEnabled,
      requireInvitation: settings.requireInvitation,
    });
  }

  @Post('/register')
  async register(
    @Body() body: RegisterDto,
    @Req() req: Request & { session: AppSession },
    @Res() res: Response,
  ): Promise<void> {
    const settings = await this.platformSettings.getSettings();

    let invitation: Awaited<ReturnType<InvitationsService['findValidByToken']>> = null;
    if (settings.requireInvitation) {
      if (!body.token) {
        renderJsx(res.status(403), RegisterPage, {
          selfRegistrationEnabled: false,
          requireInvitation: true,
          error: 'An invitation is required to register.',
        });
        return;
      }
      invitation = await this.invitations.findValidByToken(body.token);
      if (!invitation) {
        renderJsx(res, RegisterPage, { tokenInvalid: true });
        return;
      }
    }

    if (!settings.selfRegistrationEnabled && !invitation) {
      renderJsx(res.status(403), RegisterPage, {
        selfRegistrationEnabled: false,
        requireInvitation: settings.requireInvitation,
      });
      return;
    }

    const dto = plainToInstance(RegisterDto, body);
    const errors = await validate(dto);
    if (errors.length > 0) {
      const message = errors.flatMap((e) => Object.values(e.constraints ?? {})).join(', ');
      renderJsx(res.status(400), RegisterPage, {
        selfRegistrationEnabled: settings.selfRegistrationEnabled,
        requireInvitation: settings.requireInvitation,
        token: body.token,
        email: body.email,
        error: message,
      });
      return;
    }

    if (body.password !== body.confirmPassword) {
      renderJsx(res.status(400), RegisterPage, {
        selfRegistrationEnabled: settings.selfRegistrationEnabled,
        requireInvitation: settings.requireInvitation,
        token: body.token,
        email: body.email,
        error: 'Passwords do not match.',
      });
      return;
    }

    let user: Awaited<ReturnType<UsersService['create']>>;
    try {
      user = await this.users.create({
        fullName: body.fullName,
        email: body.email,
        password: body.password,
      });
    } catch (err) {
      if (err instanceof ConflictException) {
        renderJsx(res.status(409), RegisterPage, {
          selfRegistrationEnabled: settings.selfRegistrationEnabled,
          requireInvitation: settings.requireInvitation,
          token: body.token,
          email: body.email,
          error: 'Email is already registered.',
        });
        return;
      }
      throw err;
    }

    if (invitation && body.token) {
      try {
        await this.invitations.consumeToken(body.token, user.id);
      } catch (err) {
        this.logger.warn('Failed to consume invitation token', (err as Error).message);
      }
    }

    await regenerateSession(req);
    req.session.userId = user.id;
    req.session.fullName = user.fullName;
    req.session.role = user.role;
    await saveSession(req);

    res.redirect('/');
  }
}
