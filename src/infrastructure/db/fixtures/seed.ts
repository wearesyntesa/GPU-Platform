import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { applyFixtures } from './apply-fixtures';

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://rpl:rpl@localhost:15432/rpl_gpu';

export async function seedDatabase(): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  await applyFixtures(db);

  await pool.end();
}

if (require.main === module) {
  seedDatabase().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
