import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { appBuildTime, appRevision, appVersion } from '@/core/app-info';
import { DbService } from '@/infrastructure/db/db.service';
import { CaddyService } from '@/infrastructure/proxy/caddy.service';
import { SwarmService } from '@/infrastructure/swarm/swarm.service';
import { existsSync } from 'node:fs';
import { env } from '@/core/config/env';

type Check = { ok: boolean; message?: string };

@Controller()
export class HealthController {
  constructor(
    private readonly db: DbService,
    private readonly caddy: CaddyService,
    private readonly swarm: SwarmService,
  ) {}

  @Get('/healthz')
  healthz(): { status: 'ok'; version: string; revision: string | null; buildTime: string | null } {
    return {
      status: 'ok',
      version: appVersion(),
      revision: appRevision(),
      buildTime: appBuildTime(),
    };
  }

  @Get('/version')
  version(): { version: string; revision: string | null; buildTime: string | null } {
    return {
      version: appVersion(),
      revision: appRevision(),
      buildTime: appBuildTime(),
    };
  }

  @Get('/readyz')
  async readyz(): Promise<{ status: 'ok'; checks: Record<string, Check> }> {
    const checks = {
      migrations: this.checkMigrations(),
      db: await this.check(() => this.db.ping()),
      caddy: await this.check(() => this.caddy.ping()),
      docker: await this.check(() => this.swarm.ping()),
    };

    if (Object.values(checks).some((check) => !check.ok)) {
      throw new HttpException({ status: 'error', checks }, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return { status: 'ok', checks };
  }

  private checkMigrations(): Check {
    const semaphorePath = process.env.MIGRATION_SEMAPHORE_PATH ?? '/run/rpl-gpu/migration-complete';
    if (existsSync(semaphorePath)) {
      return { ok: true };
    }
    return { ok: false, message: 'Migrations not complete' };
  }

  private async check(work: () => Promise<void>): Promise<Check> {
    try {
      await withTimeout(work(), env.readinessCheckTimeoutMs);
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }
}

async function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
