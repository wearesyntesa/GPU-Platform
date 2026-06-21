import { Injectable, Logger } from '@nestjs/common';
import { env } from '@/core/config/env';

type CaddyRoute = {
  '@id'?: string;
  match?: unknown;
  handle?: unknown;
  terminal?: boolean;
};

@Injectable()
export class CaddyService {
  private readonly logger = new Logger(CaddyService.name);

  platformRouteId(proxyPath: string): string {
    return this.routeId(proxyPath);
  }

  async ping(): Promise<void> {
    const response = await fetch(`${env.caddyAdminUrl}/config/`, {
      headers: { origin: env.caddyAdminUrl },
      signal: AbortSignal.timeout(env.caddyAdminTimeoutMs),
    });
    if (!response.ok) throw new Error(`Caddy admin not ready: ${response.status}`);
  }

  async addRoute(proxyPath: string, upstreamPort: number): Promise<void> {
    await this.addProxyRoute(proxyPath, `host.docker.internal:${upstreamPort}`);
    this.logger.log(`Caddy route added: ${proxyPath} -> ${upstreamPort}`);
  }

  async setInactiveRoute(proxyPath: string): Promise<void> {
    await this.removeRoute(proxyPath);
    await this.addProxyRoute(proxyPath, env.caddyAppUpstream);
    this.logger.log(`Caddy inactive route added: ${proxyPath} -> app`);
  }

  private async addProxyRoute(proxyPath: string, dial: string): Promise<void> {
    const id = this.routeId(proxyPath);

    const route = {
      '@id': id,
      match: [{ path: [`${proxyPath}/*`, proxyPath] }],
      handle: [
        {
          handler: 'reverse_proxy',
          transport: {
            protocol: 'http',
            dial_timeout: '3s',
            response_header_timeout: '30s',
          },
          upstreams: [{ dial }],
        },
      ],
      terminal: true,
    };

    const routesResponse = await fetch(`${env.caddyAdminUrl}/config/apps/http/servers/srv0/routes`, {
      headers: { origin: env.caddyAdminUrl },
      signal: AbortSignal.timeout(env.caddyAdminTimeoutMs),
    });
    if (!routesResponse.ok)
      throw new Error(
        `Caddy list routes failed: ${routesResponse.status} ${await routesResponse.text()}`,
      );

    const existingRoutes = (await routesResponse.json()) as CaddyRoute[];
    const withoutCurrent = existingRoutes.filter((existingRoute) => existingRoute['@id'] !== id);
    const platformRoutes = withoutCurrent.filter((existingRoute) =>
      existingRoute['@id']?.startsWith('session--workspaces-'),
    );
    const baseRoutes = withoutCurrent.filter(
      (existingRoute) => !existingRoute['@id']?.startsWith('session--workspaces-'),
    );
    const orderedRoutes = [baseRoutes[0], route, ...platformRoutes, ...baseRoutes.slice(1)].filter(
      (orderedRoute): orderedRoute is CaddyRoute => Boolean(orderedRoute),
    );

    const response = await fetch(`${env.caddyAdminUrl}/config/apps/http/servers/srv0/routes`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', origin: env.caddyAdminUrl },
      signal: AbortSignal.timeout(env.caddyAdminTimeoutMs),
      body: JSON.stringify(orderedRoutes),
    });
    if (!response.ok)
      throw new Error(`Caddy add route failed: ${response.status} ${await response.text()}`);
  }

  async ensureRoute(proxyPath: string, upstreamPort: number): Promise<void> {
    const response = await fetch(`${env.caddyAdminUrl}/id/${this.routeId(proxyPath)}`, {
      headers: { origin: env.caddyAdminUrl },
      signal: AbortSignal.timeout(env.caddyAdminTimeoutMs),
    });
    if (response.ok) return;
    if (response.status === 404) {
      await this.addRoute(proxyPath, upstreamPort);
      return;
    }
    throw new Error(`Caddy inspect route failed: ${response.status} ${await response.text()}`);
  }

  async removeRoute(proxyPath: string): Promise<void> {
    await this.removeRouteById(this.routeId(proxyPath));
  }

  async removeRouteById(routeId: string): Promise<void> {
    const response = await fetch(`${env.caddyAdminUrl}/id/${routeId}`, {
      method: 'DELETE',
      headers: { origin: env.caddyAdminUrl },
      signal: AbortSignal.timeout(env.caddyAdminTimeoutMs),
    });
    if (response.ok || response.status === 404) return;
    throw new Error(`Caddy remove route failed: ${response.status} ${await response.text()}`);
  }

  async listPlatformRouteIds(): Promise<string[]> {
    const response = await fetch(`${env.caddyAdminUrl}/config/apps/http/servers/srv0/routes`, {
      headers: { origin: env.caddyAdminUrl },
      signal: AbortSignal.timeout(env.caddyAdminTimeoutMs),
    });
    if (!response.ok)
      throw new Error(`Caddy list routes failed: ${response.status} ${await response.text()}`);
    const routes = (await response.json()) as Array<{ '@id'?: string }>;
    return routes
      .map((route) => route['@id'])
      .filter((id): id is string => !!id && id.startsWith('session--workspaces-'));
  }

  private routeId(proxyPath: string): string {
    return `session-${proxyPath.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  }
}
