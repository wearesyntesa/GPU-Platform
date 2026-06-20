import { BadRequestException, Injectable } from '@nestjs/common';
import { runtimeImages, sessionRequests } from '@/infrastructure/db/schema';
import { EnvironmentsService } from '@/domain/environments/environments.service';
import { PlatformSettingsService } from '@/domain/platform-settings/platform-settings.service';
import type { CreateGrantDto } from '@/web/grants/dto';
import { normalizePagination, toPageResult, type PageResult } from '@/core/pagination';
import { GrantsRepository, type ApprovedGrantRow, type PendingGrantRow } from './grants.repository';

function isLiveAccessConflict(err: unknown): boolean {
  const error = err as { code?: string; constraint?: string };
  return error.code === '23505' && error.constraint === 'session_requests_one_live_per_user';
}

export interface AdminGrantsApprovalInput {
  runtimeImageId: string;
  gpuTarget: string;
  requestedCpu: number;
  requestedMemoryGb: number;
  reason: string | null;
}

@Injectable()
export class GrantsService {
  constructor(
    private readonly grantsRepository: GrantsRepository,
    private readonly environments: EnvironmentsService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  listForUser(userId: string): Promise<(typeof sessionRequests.$inferSelect)[]> {
    return this.grantsRepository.listForUser(userId);
  }

  async listForUserPage(
    userId: string,
    page: number,
    pageSize: number,
  ): Promise<PageResult<typeof sessionRequests.$inferSelect>> {
    const pagination = normalizePagination(page, pageSize);
    const total = await this.grantsRepository.countForUser(userId);
    const items = await this.grantsRepository.listForUserPage(
      userId,
      pagination.pageSize,
      pagination.offset,
    );

    return toPageResult(items, pagination.page, pagination.pageSize, total);
  }

  async listPendingPage(
    page: number,
    pageSize: number,
  ): Promise<PageResult<Awaited<ReturnType<GrantsService['listPending']>>[number]>> {
    const pagination = normalizePagination(page, pageSize);
    const total = await this.grantsRepository.countByStatus('pending');
    const items = await this.listPending(pagination.pageSize, pagination.offset);
    return toPageResult(items, pagination.page, pagination.pageSize, total);
  }

  listPending(limit = 20, offset = 0): Promise<PendingGrantRow[]> {
    return this.grantsRepository.listPending(limit, offset);
  }

  async listApprovedPage(
    page: number,
    pageSize: number,
  ): Promise<PageResult<Awaited<ReturnType<GrantsService['listApproved']>>[number]>> {
    const pagination = normalizePagination(page, pageSize);
    const total = await this.grantsRepository.countByStatus('approved');
    const items = await this.listApproved(pagination.pageSize, pagination.offset);
    return toPageResult(items, pagination.page, pagination.pageSize, total);
  }

  listApproved(limit = 20, offset = 0): Promise<ApprovedGrantRow[]> {
    return this.grantsRepository.listApproved(limit, offset);
  }

  async findById(id: string): Promise<typeof sessionRequests.$inferSelect | null> {
    return this.grantsRepository.findById(id);
  }

  async findAdminDetailsById(id: string): Promise<{
    grant: typeof sessionRequests.$inferSelect;
    user: { username: string };
    environment: typeof runtimeImages.$inferSelect;
  } | null> {
    return this.grantsRepository.findAdminDetailsById(id);
  }

  async createForUser(userId: string, dto: CreateGrantDto): Promise<string> {
    const runtime = await this.environments.findEnabledById(dto.runtimeImageId);
    if (!runtime) throw new BadRequestException('Selected environment is unavailable');
    await this.assertWithinRequestLimits(dto.requestedCpu, dto.requestedMemoryGb);
    const liveAccess = await this.grantsRepository.findLiveAccessForUser(userId);

    if (liveAccess?.status === 'pending') {
      throw new BadRequestException(
        'You already have a pending access request. Cancel it before requesting a change.',
      );
    }

    if (liveAccess?.status === 'approved') {
      const liveSession = await this.grantsRepository.findLiveWorkspaceForGrant(liveAccess.id);
      if (liveSession) {
        throw new BadRequestException(
          'Stop your active workspace before requesting access changes.',
        );
      }

      const requestId = await this.grantsRepository.createChangeRequestForUser(liveAccess.id, {
        userId,
        runtimeImageId: runtime.id,
        gpuTarget: dto.gpuTarget,
        requestedCpu: dto.requestedCpu,
        requestedMemoryGb: dto.requestedMemoryGb,
        purpose: dto.purpose,
      });
      if (!requestId)
        throw new BadRequestException('Approved grant is no longer available for replacement.');
      return requestId;
    }

    try {
      return await this.grantsRepository.createForUser({
        userId,
        runtimeImageId: runtime.id,
        gpuTarget: dto.gpuTarget,
        requestedCpu: dto.requestedCpu,
        requestedMemoryGb: dto.requestedMemoryGb,
        purpose: dto.purpose,
      });
    } catch (err) {
      if (isLiveAccessConflict(err)) {
        throw new BadRequestException(
          'You already have an active access request or grant. Cancel it or use the existing grant.',
        );
      }
      throw err;
    }
  }

  async approve(id: string, adminUserId: string, reason: string | null): Promise<void> {
    const existing = await this.findById(id);
    if (!existing || existing.status !== 'pending')
      throw new BadRequestException('Request is not pending or does not exist');
    if (await this.hasOtherLiveAccessForUser(existing.userId, id)) {
      throw new BadRequestException('Requester already has an active access request or grant');
    }

    try {
      if (await this.grantsRepository.approvePending(id, adminUserId, reason)) return;
    } catch (err) {
      if (isLiveAccessConflict(err)) {
        throw new BadRequestException('Requester already has an active access request or grant');
      }
      throw err;
    }
    throw new BadRequestException('Request is not pending or does not exist');
  }

  async approveWithAdjustments(
    id: string,
    adminUserId: string,
    input: AdminGrantsApprovalInput,
  ): Promise<void> {
    const existing = await this.findById(id);
    if (!existing || existing.status !== 'pending')
      throw new BadRequestException('Access request is not pending or does not exist');
    if (await this.hasOtherLiveAccessForUser(existing.userId, id)) {
      throw new BadRequestException('Requester already has an active access request or grant');
    }

    const environment = await this.environments.findEnabledById(input.runtimeImageId);
    if (!environment) throw new BadRequestException('Selected environment is unavailable');
    await this.assertWithinRequestLimits(input.requestedCpu, input.requestedMemoryGb);

    try {
      if (await this.grantsRepository.approvePendingWithAdjustments(id, adminUserId, input)) return;
    } catch (err) {
      if (isLiveAccessConflict(err)) {
        throw new BadRequestException('Requester already has an active access request or grant');
      }
      throw err;
    }
    throw new BadRequestException('Access request is not pending or does not exist');
  }

  async hasLiveAccessForUser(userId: string): Promise<boolean> {
    return this.grantsRepository.hasLiveAccessForUser(userId);
  }

  async findLiveAccessForUser(userId: string): Promise<typeof sessionRequests.$inferSelect | null> {
    return this.grantsRepository.findLiveAccessForUser(userId);
  }

  async hasLiveWorkspaceForGrant(id: string): Promise<boolean> {
    return (await this.grantsRepository.findLiveWorkspaceForGrant(id)) !== null;
  }

  private async hasOtherLiveAccessForUser(userId: string, requestId: string): Promise<boolean> {
    return this.grantsRepository.hasOtherLiveAccessForUser(userId, requestId);
  }

  private async assertWithinRequestLimits(
    requestedCpu: number,
    requestedMemoryGb: number,
  ): Promise<void> {
    const settings = await this.platformSettings.getSettings();
    if (requestedCpu > settings.maxRequestCpu) {
      throw new BadRequestException(
        `Requested CPU exceeds platform limit of ${settings.maxRequestCpu} cores`,
      );
    }
    if (requestedMemoryGb > settings.maxRequestMemoryGb) {
      throw new BadRequestException(
        `Requested memory exceeds platform limit of ${settings.maxRequestMemoryGb} GB`,
      );
    }
  }

  async reject(id: string, adminUserId: string, reason: string): Promise<void> {
    const cleanReason = reason.trim();
    if (!cleanReason) throw new BadRequestException('Reject reason is required');

    if (!(await this.grantsRepository.rejectPending(id, adminUserId, cleanReason))) {
      throw new BadRequestException('Request is not pending or does not exist');
    }
  }

  async cancelByUser(id: string, userId: string): Promise<void> {
    if (!(await this.grantsRepository.cancelPendingForUser(id, userId))) {
      throw new BadRequestException('Access request is not pending or does not belong to you');
    }
  }

  async revokeApproved(id: string, adminUserId: string): Promise<void> {
    const existing = await this.findById(id);
    if (!existing || existing.status !== 'approved') {
      throw new BadRequestException('Grant is not approved or does not exist');
    }

    const liveSession = await this.grantsRepository.findLiveWorkspaceForGrant(id);

    if (liveSession) {
      throw new BadRequestException(
        'Cannot revoke this grant while a workspace is active. Stop the workspace first.',
      );
    }

    if (!(await this.grantsRepository.revokeApproved(id, adminUserId))) {
      throw new BadRequestException('Grant is no longer approved');
    }
  }
}
