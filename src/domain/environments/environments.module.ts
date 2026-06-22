import { Module } from '@nestjs/common';
import { EnvironmentsService } from './environments.service';
import { EnvironmentsRepository } from './environments.repository';
import { EnvironmentImageBuilderService } from './environment-image-builder.service';
import { EnvironmentImageReadinessService } from './environment-image-readiness.service';
import { SwarmModule } from '@/infrastructure/swarm/swarm.module';

@Module({
  imports: [SwarmModule],
  providers: [
    EnvironmentsRepository,
    EnvironmentImageBuilderService,
    EnvironmentImageReadinessService,
    EnvironmentsService,
  ],
  exports: [EnvironmentImageBuilderService, EnvironmentImageReadinessService, EnvironmentsService],
})
export class EnvironmentsModule {}
