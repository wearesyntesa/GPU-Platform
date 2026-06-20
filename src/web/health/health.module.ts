import { Module } from '@nestjs/common';
import { ProxyModule } from '@/infrastructure/proxy/proxy.module';
import { SwarmModule } from '@/infrastructure/swarm/swarm.module';
import { HealthController } from './health.controller';

@Module({ imports: [ProxyModule, SwarmModule], controllers: [HealthController] })
export class HealthModule {}
