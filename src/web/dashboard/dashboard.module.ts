import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { PlatformSettingsModule } from '@/domain/platform-settings/platform-settings.module';

@Module({
  imports: [PlatformSettingsModule],
  controllers: [DashboardController],
})
export class DashboardModule {}
