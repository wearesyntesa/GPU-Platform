import { describe, expect, it, vi } from 'vitest';
import { RetentionService } from '@/domain/retention/retention.service';
import type { RetentionRepository } from '@/domain/retention/retention.repository';

function serviceWithRepository(repository: Partial<RetentionRepository>): RetentionService {
  return new RetentionService(repository as RetentionRepository);
}

describe('RetentionService', () => {
  it('returns safe default settings when no row exists', async () => {
    const service = serviceWithRepository({ getSettings: vi.fn().mockResolvedValue(null) });

    await expect(service.getSettings()).resolves.toEqual({
      enabled: false,
      auditLogDays: 90,
      workspaceDays: 90,
      accessRequestDays: 90,
      idleStopEnabled: true,
      idleTimeoutMinutes: 30,
      batchSize: 500,
    });
  });

  it('returns zero dry-run counts when retention is disabled', async () => {
    const service = serviceWithRepository({});

    await expect(
      service.dryRun({
        enabled: false,
        auditLogDays: 7,
        workspaceDays: 7,
        accessRequestDays: 7,
        idleStopEnabled: false,
        idleTimeoutMinutes: 30,
        batchSize: 10,
      }),
    ).resolves.toEqual({
      auditLogs: 0,
      terminalWorkspaces: 0,
      terminalAccessRequests: 0,
      expiredUserSessions: 0,
      total: 0,
    });
  });

  it('saves settings through singleton upsert', async () => {
    const repository = { saveSettings: vi.fn().mockResolvedValue(undefined) };
    const service = serviceWithRepository(repository);

    await service.saveSettings(
      {
        enabled: true,
        auditLogDays: 30,
        workspaceDays: 60,
        accessRequestDays: 90,
        idleStopEnabled: true,
        idleTimeoutMinutes: 45,
        batchSize: 250,
      },
      '00000000-0000-0000-0000-000000000001',
    );

    expect(repository.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        auditLogDays: 30,
        workspaceDays: 60,
        accessRequestDays: 90,
        idleStopEnabled: true,
        idleTimeoutMinutes: 45,
        batchSize: 250,
      }),
      '00000000-0000-0000-0000-000000000001',
    );
  });
});
