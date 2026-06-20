import { Module } from '@nestjs/common';
import { SwarmModule } from '@/infrastructure/swarm/swarm.module';
import { NodesService } from './nodes.service';
import { NodesRepository } from './nodes.repository';

@Module({
  imports: [SwarmModule],
  providers: [NodesRepository, NodesService],
  exports: [NodesService],
})
export class NodesModule {}
