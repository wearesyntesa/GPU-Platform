import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  Session,
  UnauthorizedException,
  Logger,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from '@/domain/auth/auth.service';
import { PlatformSettingsService } from '@/domain/platform-settings/platform-settings.service';
import type { AppSession } from '@/core/session';
import { renderJsx } from '@/core/render-jsx';
import { LoginPage } from '@/views/auth/LoginPage';
import { ChangePasswordPage } from '@/views/auth/ChangePasswordPage';
import { AuthGuard } from '@/core/guards/auth.guard';
import { UsersService } from '@/domain/users/users.service';
import { regenerateSession, saveSession } from './session-promises';

@Controller()
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  private destroySession(session: AppSession): Promise<void> {
    return new Promise((resolve, reject) => {
      session.destroy((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  @Get('/login')
  async loginPage(@Res() res: Response): Promise<void> {
    const settings = await this.platformSettings.getSettings();
    renderJsx(res, LoginPage, { selfRegistrationEnabled: settings.selfRegistrationEnabled });
  }

  @Post('/login')
  async login(
    @Body('email') email: string,
    @Body('password') password: string,
    @Req() request: Request & { session: AppSession },
    @Res() response: Response,
  ): Promise<void> {
    try {
      const user = await this.auth.verifyLocalLogin(email, password);
      await regenerateSession(request);
      request.session.userId = user.id;
      request.session.fullName = user.fullName;
      request.session.role = user.role;
      request.session.mustChangePassword = user.mustChangePassword;
      await saveSession(request);
      response.redirect(user.mustChangePassword ? '/change-password' : '/');
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        const session = request.session;
        delete session.userId;
        delete session.fullName;
        delete session.role;
        delete session.mustChangePassword;
        renderJsx(response.status(401), LoginPage, {
          error: 'Invalid email or password',
          formEmail: email,
          fullName: null,
          isAdmin: false,
        });
        return;
      }
      throw err;
    }
  }

  @Get('/change-password')
  @UseGuards(AuthGuard)
  changePasswordPage(@Session() session: AppSession, @Res() response: Response): void {
    renderJsx(response, ChangePasswordPage, {
      fullName: session.fullName ?? '',
      isAdmin: session.role === 'admin',
    });
  }

  @Post('/change-password')
  @UseGuards(AuthGuard)
  async changePassword(
    @Session() session: AppSession,
    @Body('password') password: string,
    @Body('confirmPassword') confirmPassword: string,
    @Res() response: Response,
  ): Promise<void> {
    if (!session.userId) throw new Error('AuthGuard allowed request without user id');
    if (!password || password.length < 8) {
      renderJsx(response.status(400), ChangePasswordPage, {
        fullName: session.fullName ?? '',
        isAdmin: session.role === 'admin',
        error: 'Password must be at least 8 characters.',
      });
      return;
    }
    if (password !== confirmPassword) {
      renderJsx(response.status(400), ChangePasswordPage, {
        fullName: session.fullName ?? '',
        isAdmin: session.role === 'admin',
        error: 'Passwords do not match.',
      });
      return;
    }

    await this.users.changePassword(session.userId, password);
    session.mustChangePassword = false;
    response.redirect('/');
  }

  @Post('/logout')
  async logout(@Session() session: AppSession, @Res() response: Response): Promise<void> {
    try {
      await this.destroySession(session);
    } catch (err) {
      this.logger.warn('Session destroy failed during logout', (err as Error).message);
    }
    response.redirect('/login');
  }
}
