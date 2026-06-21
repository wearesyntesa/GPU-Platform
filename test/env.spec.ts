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
    expect(env.databaseConnectionTimeoutMs).toBe(3000);
    expect(env.databaseIdleTimeoutMs).toBe(30000);
    expect(env.databaseMaxLifetimeSeconds).toBe(300);
    expect(env.sessionDatabaseConnectionTimeoutMs).toBe(3000);
    expect(env.sessionDatabaseIdleTimeoutMs).toBe(30000);
    expect(env.sessionDatabaseMaxLifetimeSeconds).toBe(300);
    expect(env.readinessCheckTimeoutMs).toBe(2500);
    expect(env.caddyAdminTimeoutMs).toBe(2500);
  });

  it('parses production hardening overrides', async () => {
    process.env = {
      NODE_ENV: 'development',
      DATABASE_CONNECTION_TIMEOUT_MS: '4000',
      DATABASE_IDLE_TIMEOUT_MS: '45000',
      DATABASE_MAX_LIFETIME_SECONDS: '600',
      SESSION_DATABASE_CONNECTION_TIMEOUT_MS: '5000',
      SESSION_DATABASE_IDLE_TIMEOUT_MS: '55000',
      SESSION_DATABASE_MAX_LIFETIME_SECONDS: '700',
      READINESS_CHECK_TIMEOUT_MS: '1500',
      CADDY_ADMIN_TIMEOUT_MS: '1200',
    };

    const { env } = await loadEnv();

    expect(env.databaseConnectionTimeoutMs).toBe(4000);
    expect(env.databaseIdleTimeoutMs).toBe(45000);
    expect(env.databaseMaxLifetimeSeconds).toBe(600);
    expect(env.sessionDatabaseConnectionTimeoutMs).toBe(5000);
    expect(env.sessionDatabaseIdleTimeoutMs).toBe(55000);
    expect(env.sessionDatabaseMaxLifetimeSeconds).toBe(700);
    expect(env.readinessCheckTimeoutMs).toBe(1500);
    expect(env.caddyAdminTimeoutMs).toBe(1200);
  });

  it('rejects non-positive timeout values', async () => {
    process.env = { NODE_ENV: 'development', READINESS_CHECK_TIMEOUT_MS: '0' };

    await expect(loadEnv()).rejects.toThrow('READINESS_CHECK_TIMEOUT_MS must be positive');
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
