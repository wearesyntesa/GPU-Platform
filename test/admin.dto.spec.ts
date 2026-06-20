import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { ApproveGrantDto, RejectGrantDto, UpdateRetentionSettingsDto } from '@/web/admin/dto';

describe('ApproveGrantDto', () => {
  it('requires adjusted approval fields', async () => {
    const dto = new ApproveGrantDto();
    dto.runtimeImageId = '0f4f6f9f-0a27-4a25-9e23-67db7c1e8c52';
    dto.gpuTarget = 'auto';
    dto.requestedCpu = 1;
    dto.requestedMemoryGb = 1;

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });
});

describe('RejectGrantDto', () => {
  it('requires a rejection reason', async () => {
    const dto = new RejectGrantDto();
    dto.reason = '';

    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('UpdateRetentionSettingsDto', () => {
  it('accepts valid retention settings', async () => {
    const dto = plainToInstance(UpdateRetentionSettingsDto, {
      enabled: 'on',
      auditLogDays: '90',
      workspaceDays: '90',
      accessRequestDays: '90',
      idleStopEnabled: 'on',
      idleTimeoutMinutes: '30',
      batchSize: '500',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.enabled).toBe(true);
    expect(dto.batchSize).toBe(500);
  });

  it('rejects unsafe retention values', async () => {
    const dto = plainToInstance(UpdateRetentionSettingsDto, {
      auditLogDays: '1',
      workspaceDays: '1',
      accessRequestDays: '1',
      idleTimeoutMinutes: '1',
      batchSize: '1',
    });

    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
  });
});
