import { Module } from '@nestjs/common';
import { EnvironmentsService } from './environments.service';
import { EnvironmentsRepository } from './environments.repository';
import { EnvironmentImageBuilderService } from './environment-image-builder.service';

@Module({
  providers: [EnvironmentsRepository, EnvironmentImageBuilderService, EnvironmentsService],
  exports: [EnvironmentImageBuilderService, EnvironmentsService],
})
export class EnvironmentsModule {}
