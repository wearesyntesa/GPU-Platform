import { Injectable } from '@nestjs/common';
import { eq, not } from 'drizzle-orm';
import { DbService } from '@/infrastructure/db/db.service';
import { runtimeImages } from '@/infrastructure/db/schema';

export type EnvironmentImage = typeof runtimeImages.$inferSelect;

@Injectable()
export class EnvironmentsRepository {
  constructor(private readonly dbService: DbService) {}

  listEnabled(): Promise<EnvironmentImage[]> {
    return this.dbService.db
      .select()
      .from(runtimeImages)
      .where(eq(runtimeImages.enabled, true))
      .orderBy(runtimeImages.name);
  }

  async findById(id: string): Promise<EnvironmentImage | null> {
    const rows = await this.dbService.db
      .select()
      .from(runtimeImages)
      .where(eq(runtimeImages.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  listAll(): Promise<EnvironmentImage[]> {
    return this.dbService.db.select().from(runtimeImages).orderBy(runtimeImages.name);
  }

  async create(data: {
    name: string;
    imageRef: string;
    description?: string | null;
    pythonVersion?: string | null;
    packageManifest?: string;
    enabled?: boolean;
  }): Promise<string> {
    const rows = await this.dbService.db
      .insert(runtimeImages)
      .values({
        name: data.name,
        imageRef: data.imageRef,
        description: data.description ?? null,
        pythonVersion: data.pythonVersion ?? null,
        packageManifest: data.packageManifest ?? '',
        enabled: data.enabled ?? true,
      })
      .returning({ id: runtimeImages.id });
    return rows[0]!.id;
  }

  async update(
    id: string,
    data: {
      name?: string;
      imageRef?: string;
      description?: string | null;
      pythonVersion?: string | null;
      packageManifest?: string;
      enabled?: boolean;
    },
  ): Promise<void> {
    await this.dbService.db
      .update(runtimeImages)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(runtimeImages.id, id));
  }

  async toggleEnabled(id: string): Promise<void> {
    await this.dbService.db
      .update(runtimeImages)
      .set({
        enabled: not(runtimeImages.enabled),
        updatedAt: new Date(),
      })
      .where(eq(runtimeImages.id, id));
  }
}
