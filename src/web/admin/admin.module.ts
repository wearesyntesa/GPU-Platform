import { Module } from '@nestjs/common';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminGrantsController } from './admin-grants.controller';
import { AdminEnvironmentsController } from './admin-environments.controller';
import { AdminWorkspacesController } from './admin-workspaces.controller';
import { AdminNodesController } from './admin-nodes.controller';
import { AdminRetentionController } from './admin-retention.controller';
import { AdminUsersController } from './admin-users.controller';
import { AdminSettingsController } from './admin-settings.controller';
import { GrantsModule } from '@/domain/grants/grants.module';
import { NodesModule } from '@/domain/nodes/nodes.module';
import { WorkspacesModule } from '@/domain/workspaces/workspaces.module';
import { EnvironmentsModule } from '@/domain/environments/environments.module';
import { AuditModule } from '@/infrastructure/audit/audit.module';
import { RetentionModule } from '@/domain/retention/retention.module';
import { UsersModule } from '@/domain/users/users.module';
import { InvitationsModule } from '@/domain/invitations/invitations.module';
import { PlatformSettingsModule } from '@/domain/platform-settings/platform-settings.module';

@Module({
  imports: [
    GrantsModule,
    NodesModule,
    WorkspacesModule,
    EnvironmentsModule,
    AuditModule,
    RetentionModule,
    UsersModule,
    InvitationsModule,
    PlatformSettingsModule,
  ],
  controllers: [
    AdminDashboardController,
    AdminGrantsController,
    AdminEnvironmentsController,
    AdminWorkspacesController,
    AdminNodesController,
    AdminRetentionController,
    AdminUsersController,
    AdminSettingsController,
  ],
})
export class AdminModule {}
