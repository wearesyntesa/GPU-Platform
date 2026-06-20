import { Module } from '@nestjs/common';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesModule } from '@/domain/workspaces/workspaces.module';
import { AuditModule } from '@/infrastructure/audit/audit.module';

@Module({ imports: [WorkspacesModule, AuditModule], controllers: [WorkspacesController] })
export class WorkspacesWebModule {}
