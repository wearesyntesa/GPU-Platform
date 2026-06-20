import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { env } from '@/core/config/env';
import { renderJsx } from '@/core/render-jsx';
import { ErrorPage } from '@/views/errors/ErrorPage';
import { ForbiddenPage } from '@/views/errors/ForbiddenPage';
import { NotFoundPage } from '@/views/errors/NotFoundPage';
import { BadRequestPage } from '@/views/errors/BadRequestPage';
import { InternalErrorPage } from '@/views/errors/InternalErrorPage';

type ErrorBody = string | { message?: string | string[]; error?: string; statusCode?: number };

function errorBody(exception: HttpException): ErrorBody {
  return exception.getResponse() as ErrorBody;
}

function errorMessages(body: ErrorBody): string[] {
  if (typeof body === 'string') return [body];
  if (Array.isArray(body.message)) return body.message;
  if (typeof body.message === 'string') return [body.message];
  if (typeof body.error === 'string') return [body.error];
  return [];
}

function wantsJson(request: Request): boolean {
  return request.accepts(['html', 'json']) === 'json';
}

@Catch()
export class HtmlExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HtmlExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    if (response.headersSent) return;

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    if (wantsJson(request)) {
      response.status(status).json(this.jsonBody(exception, status));
      return;
    }

    if (exception instanceof HttpException) {
      this.renderHttpException(response, status, errorBody(exception));
      return;
    }

    this.logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception.stack : String(exception),
    );
    renderJsx(response.status(500), InternalErrorPage, {
      stack:
        env.nodeEnv === 'production'
          ? null
          : exception instanceof Error
            ? exception.stack
            : String(exception),
    });
  }

  private jsonBody(exception: unknown, status: number): unknown {
    if (exception instanceof HttpException) return exception.getResponse();
    return { statusCode: status, message: 'Internal server error' };
  }

  private renderHttpException(response: Response, status: number, body: ErrorBody): void {
    if (status === 401) {
      response.redirect('/login');
      return;
    }

    if (status === 403) {
      renderJsx(response.status(403), ForbiddenPage, {});
      return;
    }

    if (status === 404) {
      renderJsx(response.status(404), NotFoundPage, {});
      return;
    }

    if (status === 400) {
      renderJsx(response.status(400), BadRequestPage, { messages: errorMessages(body) });
      return;
    }

    renderJsx(response.status(status), ErrorPage, {
      statusCode: status,
      message: errorMessages(body)[0] ?? 'An unexpected error occurred.',
    });
  }
}
