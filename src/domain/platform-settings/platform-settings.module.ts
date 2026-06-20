import { Module } from '@nestjs/common';
import { DbModule } from '@/infrastructure/db/db.module';
import { PlatformSettingsRepository } from './platform-settings.repository';
import { PlatformSettingsService } from './platform-settings.service';

@Module({
  imports: [DbModule],
  providers: [PlatformSettingsRepository, PlatformSettingsService],
  exports: [PlatformSettingsService],
})
export class PlatformSettingsModule {}
