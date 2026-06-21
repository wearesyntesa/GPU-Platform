import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '@/core/config/env';
import * as schema from './schema';

@Injectable()
export class DbService implements OnModuleDestroy {
  private readonly logger = new Logger(DbService.name);
  private readonly pool = new Pool({
    connectionString: env.databaseUrl,
    max: env.databasePoolMax,
    connectionTimeoutMillis: env.databaseConnectionTimeoutMs,
    idleTimeoutMillis: env.databaseIdleTimeoutMs,
    maxLifetimeSeconds: env.databaseMaxLifetimeSeconds,
  });
  readonly db = drizzle(this.pool, { schema });

  async ping(): Promise<void> {
    await this.pool.query('select 1');
  }

  async withAdvisoryLock<T>(lockKey: number, work: () => Promise<T>): Promise<T | null> {
    const client = await this.pool.connect();
    const result = await client.query<{ locked: boolean }>(
      'select pg_try_advisory_lock($1) as locked',
      [lockKey],
    );
    if (!result.rows[0]?.locked) {
      client.release();
      return null;
    }

    try {
      return await work();
    } finally {
      try {
        await client.query('select pg_advisory_unlock($1)', [lockKey]);
        try {
          client.release();
        } catch (err) {
          this.logger.error('Failed to release database client', (err as Error).message);
        }
      } catch (err) {
        this.logger.error(`Failed to release advisory lock ${lockKey}`, (err as Error).message);
        try {
          client.release(err as Error);
        } catch (releaseErr) {
          this.logger.error('Failed to discard database client', (releaseErr as Error).message);
        }
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
