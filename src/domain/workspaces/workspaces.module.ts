import { Module } from '@nestjs/common';
import { WorkspacesService } from './workspaces.service';
import { WorkspacesReconcilerService } from './workspaces-reconciler.service';
import { WorkspacesRepository } from './workspaces.repository';
import { WorkspaceActivityLogService } from './workspace-activity-log.service';
import { SwarmModule } from '@/infrastructure/swarm/swarm.module';
import { ProxyModule } from '@/infrastructure/proxy/proxy.module';
import { AuditModule } from '@/infrastructure/audit/audit.module';
import { EnvironmentsModule } from '@/domain/environments/environments.module';
import { RetentionModule } from '@/domain/retention/retention.module';

@Module({
  imports: [SwarmModule, ProxyModule, AuditModule, EnvironmentsModule, RetentionModule],
  providers: [
    WorkspacesRepository,
    WorkspacesService,
    WorkspacesReconcilerService,
    WorkspaceActivityLogService,
  ],
  exports: [WorkspacesService, WorkspacesReconcilerService],
})
export class WorkspacesModule {}
