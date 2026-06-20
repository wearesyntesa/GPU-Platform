import { Module } from '@nestjs/common';
import { SwarmService } from './swarm.service';

@Module({ providers: [SwarmService], exports: [SwarmService] })
export class SwarmModule {}
