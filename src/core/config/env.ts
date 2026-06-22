function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function requireProductionEnv(name: string, fallback: string): string {
  return requireEnv(name, isProduction() ? undefined : fallback);
}

function sessionSecret(): string {
  const value = requireProductionEnv('SESSION_SECRET', 'dev-only-change-this-session-secret');
  if (isProduction() && value.length < 32) {
    throw new Error(
      'Environment variable SESSION_SECRET must be at least 32 characters in production',
    );
  }
  return value;
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) throw new Error(`Environment variable ${name} must be integer`);
  return parsed;
}

function positiveNumberEnv(name: string, fallback: number): number {
  const value = numberEnv(name, fallback);
  if (value < 1) throw new Error(`Environment variable ${name} must be positive`);
  return value;
}

function trustProxy(): false | number | string {
  const raw = process.env.TRUST_PROXY;
  if (!raw) return isProduction() ? 1 : false;
  if (raw === 'false') return false;
  if (raw === 'true') return true as unknown as number;
  const numeric = Number(raw);
  if (Number.isInteger(numeric)) return numeric;
  return raw;
}

export const env = {
  nodeEnv: requireEnv('NODE_ENV', 'development'),
  appUrl: requireEnv('APP_URL', 'http://localhost:3000'),
  port: numberEnv('PORT', 3000),
  sessionSecret: sessionSecret(),
  databaseUrl: requireProductionEnv('DATABASE_URL', 'postgres://rpl:rpl@localhost:15432/rpl_gpu'),
  databasePoolMax: positiveNumberEnv('DATABASE_POOL_MAX', 5),
  databaseConnectionTimeoutMs: positiveNumberEnv('DATABASE_CONNECTION_TIMEOUT_MS', 3000),
  databaseIdleTimeoutMs: positiveNumberEnv('DATABASE_IDLE_TIMEOUT_MS', 30000),
  databaseMaxLifetimeSeconds: positiveNumberEnv('DATABASE_MAX_LIFETIME_SECONDS', 300),
  sessionDatabasePoolMax: positiveNumberEnv('SESSION_DATABASE_POOL_MAX', 2),
  sessionDatabaseConnectionTimeoutMs: positiveNumberEnv(
    'SESSION_DATABASE_CONNECTION_TIMEOUT_MS',
    3000,
  ),
  sessionDatabaseIdleTimeoutMs: positiveNumberEnv('SESSION_DATABASE_IDLE_TIMEOUT_MS', 30000),
  sessionDatabaseMaxLifetimeSeconds: positiveNumberEnv(
    'SESSION_DATABASE_MAX_LIFETIME_SECONDS',
    300,
  ),
  readinessCheckTimeoutMs: positiveNumberEnv('READINESS_CHECK_TIMEOUT_MS', 2500),
  trustProxy: trustProxy(),
  dockerHost: requireEnv('DOCKER_HOST', 'unix:///var/run/docker.sock'),
  caddyAdminUrl: requireProductionEnv('CADDY_ADMIN_URL', 'http://127.0.0.1:12019'),
  caddyAdminTimeoutMs: positiveNumberEnv('CADDY_ADMIN_TIMEOUT_MS', 2500),
  caddyAppUpstream: requireEnv('CADDY_APP_UPSTREAM', 'host.docker.internal:3000'),
  caddyPublicUrl: requireEnv('CADDY_PUBLIC_URL', 'http://localhost:18080'),
  caddyAccessLogPath: requireEnv('CADDY_ACCESS_LOG_PATH', 'infra/dev/caddy-logs/access.json'),
  sessionPortStart: numberEnv('SESSION_PORT_START', 20000),
  sessionPortEnd: numberEnv('SESSION_PORT_END', 20999),
  localWorkerAddress: requireEnv('LOCAL_WORKER_ADDRESS', '127.0.0.1'),
  environmentImageBuilderImage: requireEnv('ENVIRONMENT_IMAGE_BUILDER_IMAGE', 'docker:27-cli'),
};
