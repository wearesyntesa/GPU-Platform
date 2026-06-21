import { HttpException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { HealthController } from '@/web/health/health.controller';
import { env } from '@/core/config/env';
import type { DbService } from '@/infrastructure/db/db.service';
import type { CaddyService } from '@/infrastructure/proxy/caddy.service';
import type { SwarmService } from '@/infrastructure/swarm/swarm.service';

function controllerWith(mocks: {
  db?: Partial<DbService>;
  caddy?: Partial<CaddyService>;
  swarm?: Partial<SwarmService>;
}): HealthController {
  return new HealthController(
    (mocks.db ?? { ping: vi.fn().mockResolvedValue(undefined) }) as DbService,
    (mocks.caddy ?? { ping: vi.fn().mockResolvedValue(undefined) }) as CaddyService,
    (mocks.swarm ?? { ping: vi.fn().mockResolvedValue(undefined) }) as SwarmService,
  );
}

describe('HealthController', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'rpl-health-'));
    const semaphorePath = join(tempDir, 'migration-complete');
    writeFileSync(semaphorePath, 'ok');
    process.env.MIGRATION_SEMAPHORE_PATH = semaphorePath;
  });

  afterEach(() => {
    delete process.env.MIGRATION_SEMAPHORE_PATH;
    env.readinessCheckTimeoutMs = 2500;
    rmSync(tempDir, { recursive: true, force: true });
    vi.useRealTimers();
  });

  it('returns liveness metadata without dependency checks', () => {
    const controller = controllerWith({});

    expect(controller.healthz()).toMatchObject({ status: 'ok', version: expect.any(String) });
  });

  it('returns ready when DB, Caddy, and Docker are reachable', async () => {
    const controller = controllerWith({});

    await expect(controller.readyz()).resolves.toEqual({
      status: 'ok',
      checks: {
        db: { ok: true },
        migrations: { ok: true },
        caddy: { ok: true },
        docker: { ok: true },
      },
    });
  });

  it('returns 503 when a dependency is not reachable', async () => {
    const controller = controllerWith({
      db: { ping: vi.fn().mockRejectedValue(new Error('db down')) },
    });

    await expect(controller.readyz()).rejects.toBeInstanceOf(HttpException);
    await expect(controller.readyz()).rejects.toMatchObject({
      response: expect.objectContaining({ status: 'error' }),
    });
  });

  it('returns 503 when a dependency check times out', async () => {
    vi.useFakeTimers();
    env.readinessCheckTimeoutMs = 10;
    const controller = controllerWith({
      db: { ping: vi.fn().mockReturnValue(new Promise(() => undefined)) },
    });

    const result = controller.readyz();
    const assertion = expect(result).rejects.toMatchObject({
      response: expect.objectContaining({
        checks: expect.objectContaining({
          db: { ok: false, message: 'Timed out after 10ms' },
        }),
      }),
    });
    await vi.advanceTimersByTimeAsync(10);

    await assertion;
  });
});
