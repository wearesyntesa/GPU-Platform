import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { sessionUser, type AppSession } from '@/core/session';
import { renderJsx } from '@/core/render-jsx';
import { ForbiddenPage } from '@/views/errors/ForbiddenPage';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<Request & { session: AppSession }>();
    const response = http.getResponse<Response>();
    const user = sessionUser(request.session);

    if (!user) {
      response.redirect('/login');
      return false;
    }
    if (user.mustChangePassword) {
      response.redirect('/change-password');
      return false;
    }
    if (user.role === 'admin') return true;

    renderJsx(response.status(403), ForbiddenPage, {});
    return false;
  }
}
