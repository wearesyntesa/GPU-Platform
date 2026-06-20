import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { sessionUser, type AppSession } from '@/core/session';

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<Request & { session: AppSession }>();
    const response = http.getResponse<Response>();
    const user = sessionUser(request.session);
    if (user) {
      if (user.mustChangePassword && request.path !== '/change-password') {
        response.redirect('/change-password');
        return false;
      }
      return true;
    }

    response.redirect('/login');
    return false;
  }
}
