import { Injectable } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import * as argon2 from 'argon2';
import { runtimeImages, sessions, sessionRequests, workers } from '@/infrastructure/db/schema';
import { env } from '@/core/config/env';
import { normalizePagination, toPageResult, type PageResult } from '@/core/pagination';
import { WorkspacesRepository } from './workspaces.repository';
export { isWildcardGpuTarget } from './workspace-targets';

type Session = typeof sessions.$inferSelect;
type SessionRequest = typeof sessionRequests.$inferSelect;
type Worker = typeof workers.$inferSelect;
const workspaceOccupiesNodeStatuses: Session['status'][] = ['starting', 'running', 'stopping'];

export function isAllocationConflict(err: unknown): boolean {
  const error = err as { code?: string; constraint?: string };
  return (
    error.code === '23505' &&
    (error.constraint === 'sessions_one_live_workspace_per_user' ||
      error.constraint === 'sessions_one_live_workspace_per_worker' ||
      error.constraint === 'sessions_one_live_workspace_per_port')
  );
}

export function workspaceOccupiesNode(status: Session['status']): boolean {
  return workspaceOccupiesNodeStatuses.includes(status);
}

@Injectable()
export class WorkspacesService {
  constructor(private readonly workspacesRepository: WorkspacesRepository) {}

  async findActiveByUser(userId: string): Promise<Session | null> {
    return this.workspacesRepository.findActiveByUser(userId);
  }

  async findById(id: string): Promise<Session | null> {
    return this.workspacesRepository.findById(id);
  }

  async listAll(): Promise<Session[]> {
    return this.workspacesRepository.listAll();
  }

  async listAdminPage(
    page: number,
    pageSize: number,
  ): Promise<
    PageResult<{
      workspace: Session;
      requester: { fullName: string };
      environment: { name: string };
    }>
  > {
    const pagination = normalizePagination(page, pageSize);
    const total = await this.workspacesRepository.countAll();
    const items = await this.workspacesRepository.listAdminPage(
      pagination.pageSize,
      pagination.offset,
    );
    return toPageResult(items, pagination.page, pagination.pageSize, total);
  }

  async findApprovedRequestsWithoutSession(): Promise<SessionRequest[]> {
    return this.workspacesRepository.findApprovedRequestsWithoutSession();
  }

  async findByStatus(status: Session['status']): Promise<Session[]> {
    return this.workspacesRepository.findByStatus(status);
  }

  async findRunning(): Promise<Session[]> {
    return this.workspacesRepository.findRunning();
  }

  async markActivity(sessionIds: string[], activityAt?: Date): Promise<number> {
    return this.workspacesRepository.markActivity(sessionIds, activityAt);
  }

  async listLiveSwarmServiceNames(): Promise<string[]> {
    return this.workspacesRepository.listLiveSwarmServiceNames();
  }

  async listLiveProxyPaths(): Promise<string[]> {
    return this.workspacesRepository.listLiveProxyPaths();
  }

  async pickWorker(gpuTarget: string, readyWorkerIds?: string[]): Promise<Worker | null> {
    return this.workspacesRepository.pickWorker(gpuTarget, readyWorkerIds);
  }

  async allocatePort(): Promise<number | null> {
    const usedSet = new Set(await this.workspacesRepository.listUsedPorts());

    for (let port = env.sessionPortStart; port <= env.sessionPortEnd; port++) {
      if (!usedSet.has(port)) return port;
    }
    return null;
  }

  async generateJupyterToken(requestId: string): Promise<{ raw: string; hash: string }> {
    const raw = this.buildJupyterToken(requestId);
    const hash = await argon2.hash(raw);
    return { raw, hash };
  }

  buildJupyterToken(requestId: string): string {
    return createHmac('sha256', env.sessionSecret).update(`jupyter:${requestId}`).digest('hex');
  }

  async createFromApprovedRequest(
    request: SessionRequest,
    worker: Worker,
    port: number,
    tokenHash: string,
  ): Promise<Session> {
    return this.workspacesRepository.createFromApprovedRequest(request, worker, port, tokenHash);
  }

  async setSwarmServiceId(sessionId: string, serviceId: string): Promise<boolean> {
    return this.workspacesRepository.setSwarmServiceId(sessionId, serviceId);
  }

  async transitionToRunning(
    sessionId: string,
    taskId: string,
    containerId: string,
  ): Promise<boolean> {
    return this.workspacesRepository.transitionToRunning(sessionId, taskId, containerId);
  }

  async transitionToFailed(sessionId: string, reason: string): Promise<boolean> {
    return this.workspacesRepository.transitionToFailed(sessionId, reason);
  }

  async transitionToStopped(sessionId: string, reason: string): Promise<boolean> {
    return this.workspacesRepository.transitionToStopped(sessionId, reason);
  }

  async transitionToStopping(sessionId: string, reason: string): Promise<boolean> {
    return this.workspacesRepository.transitionToStopping(sessionId, reason);
  }

  async getEnvironmentImage(
    runtimeImageId: string,
  ): Promise<typeof runtimeImages.$inferSelect | null> {
    return this.workspacesRepository.getEnvironmentImage(runtimeImageId);
  }

  async getRequest(requestId: string): Promise<SessionRequest | null> {
    return this.workspacesRepository.getRequest(requestId);
  }

  async cancelGrantForFailedWorkspace(requestId: string): Promise<void> {
    await this.workspacesRepository.cancelGrantForFailedWorkspace(requestId);
  }
}
