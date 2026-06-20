import { drizzle } from 'drizzle-orm/node-postgres';
import * as argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { runtimeImages, users } from '@/infrastructure/db/schema';
import { environmentFixtures, userFixtures } from './data';

type Db = ReturnType<typeof drizzle>;

export async function applyFixtures(db: Db): Promise<void> {
  for (const fixture of userFixtures) {
    const passwordHash = await argon2.hash(fixture.password);
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.username, fixture.username))
      .limit(1);
    const values = {
      username: fixture.username,
      passwordHash,
      role: fixture.role,
      status: 'active' as const,
    };

    if (existing[0]) {
      await db.update(users).set(values).where(eq(users.username, fixture.username));
    } else {
      await db.insert(users).values(values);
    }
  }

  for (const fixture of environmentFixtures) {
    const existing = await db
      .select()
      .from(runtimeImages)
      .where(eq(runtimeImages.name, fixture.name))
      .limit(1);
    if (existing[0]) {
      await db.update(runtimeImages).set(fixture).where(eq(runtimeImages.name, fixture.name));
    } else {
      await db.insert(runtimeImages).values(fixture);
    }
  }
}
