import { describe, expect, it, vi } from 'vitest';
import { AuditService } from '@/infrastructure/audit/audit.service';
import type { DbService } from '@/infrastructure/db/db.service';

function auditWithValues(values: ReturnType<typeof vi.fn>): AuditService {
  return new AuditService({
    db: {
      insert: vi.fn().mockReturnValue({ values }),
    },
  } as unknown as DbService);
}

describe('AuditService.record', () => {
  it('records audit entries when the insert succeeds', async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const service = auditWithValues(values);

    await expect(
      service.record({
        actorUserId: 'user-1',
        action: 'workspace-user-stop',
        targetType: 'workspace',
        targetId: 'workspace-1',
        metadata: { ok: true },
      }),
    ).resolves.toBeUndefined();

    expect(values).toHaveBeenCalledWith({
      actorUserId: 'user-1',
      action: 'workspace-user-stop',
      targetType: 'workspace',
      targetId: 'workspace-1',
      metadata: { ok: true },
    });
  });

  it('does not throw when the audit insert fails', async () => {
    const values = vi.fn().mockRejectedValue(new Error('audit db down'));
    const service = auditWithValues(values);

    await expect(
      service.record({ action: 'grant-approve', targetType: 'grant', targetId: 'grant-1' }),
    ).resolves.toBeUndefined();
  });
});
