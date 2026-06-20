import { Module } from '@nestjs/common';
import { RetentionService } from './retention.service';
import { RetentionRepository } from './retention.repository';

@Module({ providers: [RetentionRepository, RetentionService], exports: [RetentionService] })
export class RetentionModule {}
