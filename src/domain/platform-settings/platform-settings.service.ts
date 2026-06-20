import { Injectable } from '@nestjs/common';
import { PlatformSettingsRepository, PlatformSettingsValue } from './platform-settings.repository';

const DEFAULT: PlatformSettingsValue = {
  selfRegistrationEnabled: false,
  requireInvitation: true,
  maxRequestCpu: 128,
  maxRequestMemoryGb: 1024,
};

@Injectable()
export class PlatformSettingsService {
  constructor(private readonly repo: PlatformSettingsRepository) {}

  async getSettings(): Promise<PlatformSettingsValue> {
    const settings = await this.repo.getSettings();
    return settings ?? DEFAULT;
  }

  async saveSettings(settings: PlatformSettingsValue, updatedBy: string): Promise<void> {
    await this.repo.saveSettings(settings, updatedBy);
  }
}
