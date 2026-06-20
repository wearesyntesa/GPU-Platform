import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = process.env;

async function loadEnv(): Promise<typeof import('@/core/config/env')> {
  vi.resetModules();
  return import('@/core/config/env');
}

describe('env', () => {
  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.resetModules();
  });

  it('keeps development fallbacks available', async () => {
    process.env = { NODE_ENV: 'development' };

    const { env } = await loadEnv();

    expect(env.databaseUrl).toBe('postgres://rpl:rpl@localhost:15432/rpl_gpu');
    expect(env.sessionSecret).toBe('dev-only-change-this-session-secret');
  });

  it('requires production DATABASE_URL, SESSION_SECRET, and CADDY_ADMIN_URL', async () => {
    process.env = { NODE_ENV: 'production' };

    await expect(loadEnv()).rejects.toThrow(
      'Missing required environment variable: SESSION_SECRET',
    );
  });

  it('rejects short production session secrets', async () => {
    process.env = {
      NODE_ENV: 'production',
      SESSION_SECRET: 'short',
      DATABASE_URL: 'postgres://rpl:rpl@postgres:5432/rpl_gpu',
      CADDY_ADMIN_URL: 'http://caddy:2019',
    };

    await expect(loadEnv()).rejects.toThrow('SESSION_SECRET must be at least 32 characters');
  });
});
