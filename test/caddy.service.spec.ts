import { afterEach, describe, expect, it, vi } from 'vitest';
import { CaddyService } from '@/infrastructure/proxy/caddy.service';

describe('CaddyService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('adds routes without deleting an existing route first', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [{ handle: [] }] })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    await new CaddyService().addRoute('/workspaces/request-1', 20000);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:12019/config/apps/http/servers/srv0/routes',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('ensures a missing route by adding it', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'missing' })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [{ handle: [] }] })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    await new CaddyService().ensureRoute('/workspaces/request-1', 20000);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://127.0.0.1:12019/config/apps/http/servers/srv0/routes',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('replaces a workspace route with an app-backed inactive route', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [{ handle: [] }] })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    await new CaddyService().setInactiveRoute('/workspaces/session-1');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:12019/id/session--workspaces-session-1',
      expect.objectContaining({ method: 'DELETE' }),
    );

    const [, addRouteOptions] = fetchMock.mock.calls[2] ?? [];
    expect(addRouteOptions).toBeDefined();
    const routes = JSON.parse((addRouteOptions as { body: string }).body) as Array<{
      '@id'?: string;
    }>;
    const addedRoute = routes.find((route) => route['@id'] === 'session--workspaces-session-1');
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://127.0.0.1:12019/config/apps/http/servers/srv0/routes',
      expect.objectContaining({ method: 'PATCH' }),
    );
    expect(addedRoute).toMatchObject({
      '@id': 'session--workspaces-session-1',
      match: [{ path: ['/workspaces/session-1/*', '/workspaces/session-1'] }],
      handle: [{ handler: 'reverse_proxy', upstreams: [{ dial: 'host.docker.internal:3000' }] }],
      terminal: true,
    });
  });
});
