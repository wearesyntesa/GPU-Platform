import { Module } from '@nestjs/common';
import { GrantsService } from './grants.service';
import { GrantsRepository } from './grants.repository';
import { EnvironmentsModule } from '@/domain/environments/environments.module';
import { PlatformSettingsModule } from '@/domain/platform-settings/platform-settings.module';

@Module({
  imports: [EnvironmentsModule, PlatformSettingsModule],
  providers: [GrantsRepository, GrantsService],
  exports: [GrantsService],
})
export class GrantsModule {}
