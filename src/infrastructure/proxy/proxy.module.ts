import { Module } from '@nestjs/common';
import { CaddyService } from './caddy.service';

@Module({ providers: [CaddyService], exports: [CaddyService] })
export class ProxyModule {}
