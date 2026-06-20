import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthWebModule } from '@/web/auth/auth.module';
import { DashboardModule } from '@/web/dashboard/dashboard.module';
import { DbModule } from '@/infrastructure/db/db.module';
import { GrantsWebModule } from '@/web/grants/grants.module';
import { AdminModule } from '@/web/admin/admin.module';
import { WorkspacesWebModule } from '@/web/workspaces/workspaces.module';
import { AuthModule } from '@/domain/auth/auth.module';
import { GrantsModule } from '@/domain/grants/grants.module';
import { WorkspacesModule } from '@/domain/workspaces/workspaces.module';
import { NodesModule } from '@/domain/nodes/nodes.module';
import { EnvironmentsModule } from '@/domain/environments/environments.module';
import { SwarmModule } from '@/infrastructure/swarm/swarm.module';
import { ProxyModule } from '@/infrastructure/proxy/proxy.module';
import { AuditModule } from '@/infrastructure/audit/audit.module';
import { RetentionModule } from '@/domain/retention/retention.module';
import { HealthModule } from '@/web/health/health.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    DbModule,
    AuditModule,
    RetentionModule,
    AuthModule,
    HealthModule,
    AuthWebModule,
    DashboardModule,
    GrantsModule,
    GrantsWebModule,
    AdminModule,
    WorkspacesModule,
    WorkspacesWebModule,
    NodesModule,
    EnvironmentsModule,
    SwarmModule,
    ProxyModule,
  ],
})
export class AppModule {}
