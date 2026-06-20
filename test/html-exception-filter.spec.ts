import {
  BadRequestException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HtmlExceptionFilter } from '@/core/filters/html-exception.filter';

vi.mock('@/core/render-jsx', () => ({
  renderJsx: vi.fn(),
}));

import { renderJsx } from '@/core/render-jsx';
const renderJsxMock = vi.mocked(renderJsx);

function createHost(acceptResult: string | false = 'html') {
  const response = {
    headersSent: false,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    redirect: vi.fn().mockReturnThis(),
    type: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  const request = {
    accepts: vi.fn().mockReturnValue(acceptResult),
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  };
  return { host, request, response };
}

describe('HtmlExceptionFilter', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('redirects HTML 401 responses to login', () => {
    const { host, response } = createHost('html');
    new HtmlExceptionFilter().catch(
      new UnauthorizedException('Invalid username or password'),
      host as never,
    );
    expect(response.redirect).toHaveBeenCalledWith('/login');
  });

  it('keeps JSON response shape for JSON clients', () => {
    const { host, response } = createHost('json');
    new HtmlExceptionFilter().catch(
      new UnauthorizedException('Invalid username or password'),
      host as never,
    );
    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it('renders validation errors as HTML bad request page', () => {
    const { host, response } = createHost('html');
    new HtmlExceptionFilter().catch(
      new BadRequestException(['requestedCpu must not be less than 1']),
      host as never,
    );
    expect(response.status).toHaveBeenCalledWith(400);
    expect(renderJsxMock).toHaveBeenCalledWith(
      response,
      expect.anything(),
      expect.objectContaining({ messages: ['requestedCpu must not be less than 1'] }),
    );
  });

  it('renders 404 as HTML not-found page', () => {
    const { host, response } = createHost('html');
    new HtmlExceptionFilter().catch(new NotFoundException(), host as never);
    expect(response.status).toHaveBeenCalledWith(404);
    expect(renderJsxMock).toHaveBeenCalledWith(response, expect.anything(), expect.anything());
  });

  it('renders unknown errors as internal error page', () => {
    const { host, response } = createHost('html');
    new HtmlExceptionFilter().catch(new Error('database exploded'), host as never);
    expect(response.status).toHaveBeenCalledWith(500);
    expect(renderJsxMock).toHaveBeenCalledWith(
      response,
      expect.anything(),
      expect.objectContaining({ stack: expect.stringContaining('database exploded') }),
    );
  });
});
