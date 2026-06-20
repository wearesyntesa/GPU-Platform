import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { GrantsService } from '@/domain/grants/grants.service';
import type { EnvironmentsService } from '@/domain/environments/environments.service';
import type { GrantsRepository } from '@/domain/grants/grants.repository';
import type { PlatformSettingsService } from '@/domain/platform-settings/platform-settings.service';

const platformSettings = {
  getSettings: vi.fn().mockResolvedValue({
    selfRegistrationEnabled: false,
    requireInvitation: true,
    maxRequestCpu: 128,
    maxRequestMemoryGb: 1024,
  }),
} as unknown as PlatformSettingsService;

function serviceWithUpdateError(error: unknown): GrantsService {
  return new GrantsService(
    {
      approvePending: vi.fn().mockRejectedValue(error),
      approvePendingWithAdjustments: vi.fn().mockRejectedValue(error),
    } as unknown as GrantsRepository,
    {
      findEnabledById: vi.fn().mockResolvedValue({ id: 'runtime-1' }),
    } as unknown as EnvironmentsService,
    platformSettings,
  );
}

function serviceForRevoke(params: {
  liveSessions: { id: string }[];
  updatedRows: { id: string }[];
}): GrantsService {
  return new GrantsService(
    {
      findLiveWorkspaceForGrant: vi.fn().mockResolvedValue(params.liveSessions[0] ?? null),
      revokeApproved: vi.fn().mockResolvedValue(params.updatedRows.length > 0),
    } as unknown as GrantsRepository,
    {} as EnvironmentsService,
    platformSettings,
  );
}

function serviceForCreate(repository: Partial<GrantsRepository>): GrantsService {
  return new GrantsService(
    repository as GrantsRepository,
    {
      findEnabledById: vi.fn().mockResolvedValue({ id: 'runtime-1' }),
    } as unknown as EnvironmentsService,
    platformSettings,
  );
}

const requestDto = {
  runtimeImageId: 'runtime-1',
  gpuTarget: 'auto',
  requestedCpu: 2,
  requestedMemoryGb: 4,
  purpose: 'class work',
};

describe('GrantsService approval races', () => {
  it('maps approve live-access unique conflicts to a clean bad request', async () => {
    const service = serviceWithUpdateError({
      code: '23505',
      constraint: 'session_requests_one_live_per_user',
    });
    vi.spyOn(service, 'findById').mockResolvedValue({
      id: 'request-1',
      userId: 'user-1',
      status: 'pending',
    } as Awaited<ReturnType<GrantsService['findById']>>);
    vi.spyOn(
      service as unknown as {
        hasOtherLiveAccessForUser: (userId: string, id: string) => Promise<boolean>;
      },
      'hasOtherLiveAccessForUser',
    ).mockResolvedValue(false);

    await expect(service.approve('request-1', 'admin-1', null)).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.approve('request-1', 'admin-1', null)).rejects.toThrow(
      'Requester already has an active access request or grant',
    );
  });

  it('maps approveWithAdjustments live-access unique conflicts to a clean bad request', async () => {
    const service = serviceWithUpdateError({
      code: '23505',
      constraint: 'session_requests_one_live_per_user',
    });
    vi.spyOn(service, 'findById').mockResolvedValue({
      id: 'request-1',
      userId: 'user-1',
      status: 'pending',
    } as Awaited<ReturnType<GrantsService['findById']>>);
    vi.spyOn(
      service as unknown as {
        hasOtherLiveAccessForUser: (userId: string, id: string) => Promise<boolean>;
      },
      'hasOtherLiveAccessForUser',
    ).mockResolvedValue(false);

    await expect(
      service.approveWithAdjustments('request-1', 'admin-1', {
        runtimeImageId: 'runtime-1',
        gpuTarget: 'auto',
        requestedCpu: 1,
        requestedMemoryGb: 1,
        reason: null,
      }),
    ).rejects.toThrow('Requester already has an active access request or grant');
  });
});

describe('GrantsService.revokeApproved', () => {
  it('cancels an approved grant without a live workspace', async () => {
    const service = serviceForRevoke({ liveSessions: [], updatedRows: [{ id: 'request-1' }] });
    vi.spyOn(service, 'findById').mockResolvedValue({
      id: 'request-1',
      status: 'approved',
    } as Awaited<ReturnType<GrantsService['findById']>>);

    await expect(service.revokeApproved('request-1', 'admin-1')).resolves.toBeUndefined();
  });

  it('blocks revoke when the grant has a live workspace', async () => {
    const service = serviceForRevoke({ liveSessions: [{ id: 'session-1' }], updatedRows: [] });
    vi.spyOn(service, 'findById').mockResolvedValue({
      id: 'request-1',
      status: 'approved',
    } as Awaited<ReturnType<GrantsService['findById']>>);

    await expect(service.revokeApproved('request-1', 'admin-1')).rejects.toThrow(
      'Cannot revoke this grant while a workspace is active. Stop the workspace first.',
    );
  });

  it('rejects non-approved grants', async () => {
    const service = serviceForRevoke({ liveSessions: [], updatedRows: [] });
    vi.spyOn(service, 'findById').mockResolvedValue({
      id: 'request-1',
      status: 'pending',
    } as Awaited<ReturnType<GrantsService['findById']>>);

    await expect(service.revokeApproved('request-1', 'admin-1')).rejects.toThrow(
      'Grant is not approved or does not exist',
    );
  });
});

describe('GrantsService.createForUser', () => {
  it('blocks a change request while an approved grant has a live workspace', async () => {
    const service = serviceForCreate({
      findLiveAccessForUser: vi.fn().mockResolvedValue({ id: 'grant-1', status: 'approved' }),
      findLiveWorkspaceForGrant: vi.fn().mockResolvedValue({ id: 'session-1' }),
    });

    await expect(service.createForUser('user-1', requestDto)).rejects.toThrow(
      'Stop your active workspace before requesting access changes.',
    );
  });

  it('supersedes an approved grant without a live workspace before creating a new pending request', async () => {
    const createChangeRequestForUser = vi.fn().mockResolvedValue('request-2');
    const service = serviceForCreate({
      findLiveAccessForUser: vi.fn().mockResolvedValue({ id: 'grant-1', status: 'approved' }),
      findLiveWorkspaceForGrant: vi.fn().mockResolvedValue(null),
      createChangeRequestForUser,
    });

    await expect(service.createForUser('user-1', requestDto)).resolves.toBe('request-2');
    expect(createChangeRequestForUser).toHaveBeenCalledWith(
      'grant-1',
      expect.objectContaining({ userId: 'user-1', requestedCpu: 2, requestedMemoryGb: 4 }),
    );
  });
});
