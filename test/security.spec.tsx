import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import * as React from 'react';
import { renderJsx } from '@/core/render-jsx';
import { csrfProtection, securityHeaders } from '@/core/security';
import type { AppSession } from '@/core/session';

describe('renderJsx CSRF injection', () => {
  it('adds hidden CSRF fields to POST forms only', () => {
    function Page(): React.ReactElement {
      return (
        <html>
          <body>
            <form method="post" action="/save">
              <button type="submit">Save</button>
            </form>
            <form method="get" action="/search">
              <button type="submit">Search</button>
            </form>
          </body>
        </html>
      );
    }
    const response = {
      locals: { csrfToken: 'token-1' },
      type: vi.fn().mockReturnThis(),
      send: vi.fn(),
    } as unknown as Response;

    renderJsx(response, Page, {});

    const html = vi.mocked(response.send).mock.calls[0]?.[0] as string;
    expect(html).toContain('name="_csrf" value="token-1"');
    expect(html.match(/name="_csrf"/g)).toHaveLength(1);
  });
});

describe('csrfProtection', () => {
  it('creates a session token for safe requests', () => {
    const next = vi.fn() as NextFunction;
    const request = { method: 'GET', session: {} as AppSession } as Request & { session: AppSession };
    const response = { locals: {} } as Response;

    csrfProtection(request, response, next);

    expect(request.session.csrfToken).toMatch(/^[0-9a-f]{64}$/);
    expect(response.locals.csrfToken).toBe(request.session.csrfToken);
    expect(next).toHaveBeenCalled();
  });

  it('rejects unsafe requests with invalid tokens', () => {
    const next = vi.fn() as NextFunction;
    const send = vi.fn();
    const response = {
      locals: {},
      status: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      send,
    } as unknown as Response;
    const request = {
      method: 'POST',
      body: { _csrf: 'bad' },
      header: vi.fn(),
      session: { csrfToken: 'a'.repeat(64) } as AppSession,
    } as unknown as Request & { session: AppSession };

    csrfProtection(request, response, next);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(send).toHaveBeenCalledWith('Invalid CSRF token');
    expect(next).not.toHaveBeenCalled();
  });

  it('strips valid CSRF fields before Nest validation sees the body', () => {
    const next = vi.fn() as NextFunction;
    const response = { locals: {} } as Response;
    const token = 'b'.repeat(64);
    const body = { _csrf: token, email: 'student01@syntesa.net' };
    const request = {
      method: 'POST',
      body,
      header: vi.fn(),
      session: { csrfToken: token } as AppSession,
    } as unknown as Request & { session: AppSession };

    csrfProtection(request, response, next);

    expect(body).toEqual({ email: 'student01@syntesa.net' });
    expect(next).toHaveBeenCalled();
  });
});

describe('securityHeaders', () => {
  it('sets baseline browser security headers', () => {
    const next = vi.fn() as NextFunction;
    const response = { setHeader: vi.fn() } as unknown as Response;
    const request = { secure: true, headers: {} } as Request;

    securityHeaders(request, response, next);

    expect(response.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    expect(response.setHeader).toHaveBeenCalledWith(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains',
    );
    expect(next).toHaveBeenCalled();
  });
});
