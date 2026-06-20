import { Injectable } from '@nestjs/common';
import { DbService } from '@/infrastructure/db/db.service';
import { platformSettings } from '@/infrastructure/db/schema';

export interface PlatformSettingsValue {
  selfRegistrationEnabled: boolean;
  requireInvitation: boolean;
  maxRequestCpu: number;
  maxRequestMemoryGb: number;
}

@Injectable()
export class PlatformSettingsRepository {
  constructor(private readonly db: DbService) {}

  async getSettings(): Promise<PlatformSettingsValue | null> {
    const result = await this.db.db.select().from(platformSettings).limit(1);

    if (result.length === 0) return null;

    const row = result[0];
    if (!row) return null;
    return {
      selfRegistrationEnabled: row.selfRegistrationEnabled,
      requireInvitation: row.requireInvitation,
      maxRequestCpu: row.maxRequestCpu,
      maxRequestMemoryGb: row.maxRequestMemoryGb,
    };
  }

  async saveSettings(settings: PlatformSettingsValue, updatedBy: string): Promise<void> {
    await this.db.db
      .insert(platformSettings)
      .values({
        id: 'settings',
        selfRegistrationEnabled: settings.selfRegistrationEnabled,
        requireInvitation: settings.requireInvitation,
        maxRequestCpu: settings.maxRequestCpu,
        maxRequestMemoryGb: settings.maxRequestMemoryGb,
        updatedBy,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: platformSettings.id,
        set: {
          selfRegistrationEnabled: settings.selfRegistrationEnabled,
          requireInvitation: settings.requireInvitation,
          maxRequestCpu: settings.maxRequestCpu,
          maxRequestMemoryGb: settings.maxRequestMemoryGb,
          updatedBy,
          updatedAt: new Date(),
        },
      });
  }
}
