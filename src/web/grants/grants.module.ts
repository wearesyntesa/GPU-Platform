import { Module } from '@nestjs/common';
import { GrantsController } from './grants.controller';
import { GrantsModule } from '@/domain/grants/grants.module';
import { EnvironmentsModule } from '@/domain/environments/environments.module';
import { NodesModule } from '@/domain/nodes/nodes.module';
import { PlatformSettingsModule } from '@/domain/platform-settings/platform-settings.module';

@Module({
  imports: [GrantsModule, EnvironmentsModule, NodesModule, PlatformSettingsModule],
  controllers: [GrantsController],
})
export class GrantsWebModule {}
