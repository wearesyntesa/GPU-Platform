import { Injectable, Logger } from '@nestjs/common';
import { DbService } from '@/infrastructure/db/db.service';
import { auditLogs } from '@/infrastructure/db/schema';

type AuditMetadata = Record<string, string | number | boolean | null>;

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly dbService: DbService) {}

  async record(params: {
    actorUserId?: string | null;
    action: string;
    targetType: string;
    targetId?: string | null;
    metadata?: AuditMetadata;
  }): Promise<void> {
    const metadata = params.metadata ?? {};
    try {
      await this.dbService.db.insert(auditLogs).values({
        actorUserId: params.actorUserId ?? null,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId ?? null,
        metadata,
      });
    } catch (err) {
      this.logger.warn(`Audit record failed for ${params.action}`, (err as Error).message);
      return;
    }
    this.logger.log(`${params.action} ${JSON.stringify(metadata)}`);
  }
}
