import { describe, expect, it, vi } from 'vitest';
import { WorkspacesReconcilerService } from '@/domain/workspaces/workspaces-reconciler.service';
import type { WorkspacesService } from '@/domain/workspaces/workspaces.service';
import type { SwarmService } from '@/infrastructure/swarm/swarm.service';
import type { CaddyService } from '@/infrastructure/proxy/caddy.service';
import type { DbService } from '@/infrastructure/db/db.service';
import type { AuditService } from '@/infrastructure/audit/audit.service';
import type { sessionRequests } from '@/infrastructure/db/schema';
import type { EnvironmentImageReadinessService } from '@/domain/environments/environment-image-readiness.service';
import type { RetentionService } from '@/domain/retention/retention.service';
import type { WorkspaceActivityLogService } from '@/domain/workspaces/workspace-activity-log.service';

type ProvisionOne = (request: typeof sessionRequests.$inferSelect) => Promise<boolean>;
type StopRequested = () => Promise<void>;

function reconcilerWith(mocks: {
  workspaces: Partial<WorkspacesService>;
  swarm: Partial<SwarmService>;
  db?: Partial<DbService>;
  audit?: Partial<AuditService>;
  imageReadiness?: Partial<EnvironmentImageReadinessService>;
  retention?: Partial<RetentionService>;
  activityLog?: Partial<WorkspaceActivityLogService>;
  caddy?: Partial<CaddyService>;
}): WorkspacesReconcilerService {
  const swarmDefaults = {
    listPlatformServices: vi.fn().mockResolvedValue([]),
    listPlatformVolumes: vi.fn().mockResolvedValue([]),
    removeVolume: vi.fn().mockResolvedValue(undefined),
  };

  return new WorkspacesReconcilerService(
    mocks.workspaces as WorkspacesService,
    { ...swarmDefaults, ...mocks.swarm } as SwarmService,
    (mocks.caddy ?? { listPlatformRouteIds: vi.fn().mockResolvedValue([]) }) as CaddyService,
    (mocks.db ?? {}) as DbService,
    (mocks.audit ?? { record: vi.fn() }) as AuditService,
    (mocks.imageReadiness ?? {
      scheduleRuntime: vi.fn().mockResolvedValue(undefined),
      listReadyWorkerIds: vi.fn().mockResolvedValue(['worker-1']),
      isReady: vi.fn().mockResolvedValue('rpl/jupyter-local:dev'),
    }) as EnvironmentImageReadinessService,
    (mocks.retention ?? {
      getSettings: vi.fn().mockResolvedValue({ idleStopEnabled: false, idleTimeoutMinutes: 30 }),
    }) as RetentionService,
    (mocks.activityLog ?? { ingest: vi.fn().mockResolvedValue(0) }) as WorkspaceActivityLogService,
  );
}

describe('WorkspacesReconcilerService.startApprovedRequest', () => {
  it('returns start-in-progress when the request advisory lock is contended', async () => {
    const service = reconcilerWith({
      workspaces: {},
      swarm: {},
      db: { withAdvisoryLock: vi.fn().mockResolvedValue(null) },
    });

    await expect(service.startApprovedRequest('request-1', 'user-1')).resolves.toBe(
      'start-in-progress',
    );
  });
});

describe('WorkspacesReconcilerService provisioning failure', () => {
  it('creates the swarm service with the derived environment image', async () => {
    const createService = vi.fn().mockResolvedValue({ serviceId: 'service-1' });
    const service = reconcilerWith({
      workspaces: {
        pickWorker: vi.fn().mockResolvedValue({ id: 'worker-1', swarmNodeId: 'node-1' }),
        allocatePort: vi.fn().mockResolvedValue(20000),
        getEnvironmentImage: vi.fn().mockResolvedValue({
          id: 'runtime-1',
          imageRef: 'python:3.12-slim',
          packageManifest: 'jupyterlab\nnumpy',
        }),
        generateJupyterToken: vi.fn().mockResolvedValue({ raw: 'token', hash: 'hash' }),
        createFromApprovedRequest: vi.fn().mockResolvedValue({
          id: 'session-1',
          swarmServiceName: 'rpl-workspace-session-1',
          proxyPath: '/workspaces/request-1',
        }),
        setSwarmServiceId: vi.fn().mockResolvedValue(true),
      },
      swarm: {
        findServiceByName: vi.fn().mockResolvedValue(null),
        createService,
      },
      imageReadiness: {
        scheduleRuntime: vi.fn().mockResolvedValue(undefined),
        listReadyWorkerIds: vi.fn().mockResolvedValue(['worker-1']),
        isReady: vi.fn().mockResolvedValue('rpl-gpu-env-pytorch-runtime-1:sha-abcdef123456'),
      },
    });
    const provisionOne = (service as unknown as { provisionOne: ProvisionOne }).provisionOne.bind(
      service,
    );

    await expect(
      provisionOne({
        id: 'request-1',
        userId: 'user-1',
        runtimeImageId: 'runtime-1',
        gpuTarget: 'auto',
        requestedCpu: 1,
        requestedMemoryGb: 1,
      } as typeof sessionRequests.$inferSelect),
    ).resolves.toBe(true);

    expect(createService).toHaveBeenCalledWith(
      expect.objectContaining({ image: 'rpl-gpu-env-pytorch-runtime-1:sha-abcdef123456' }),
    );
  });

  it('does not create a session when no worker has the runtime image ready', async () => {
    const createFromApprovedRequest = vi.fn();
    const service = reconcilerWith({
      workspaces: {
        pickWorker: vi.fn().mockResolvedValue(null),
        getEnvironmentImage: vi.fn().mockResolvedValue({
          id: 'runtime-1',
          imageRef: 'python:3.12-slim',
          packageManifest: 'jupyterlab\nnumpy',
        }),
        createFromApprovedRequest,
      },
      swarm: { createService: vi.fn() },
      imageReadiness: {
        scheduleRuntime: vi.fn().mockResolvedValue(undefined),
        listReadyWorkerIds: vi.fn().mockResolvedValue([]),
        isReady: vi.fn().mockResolvedValue(null),
      },
    });
    const provisionOne = (service as unknown as { provisionOne: ProvisionOne }).provisionOne.bind(
      service,
    );

    await expect(
      provisionOne({
        id: 'request-1',
        userId: 'user-1',
        runtimeImageId: 'runtime-1',
        gpuTarget: 'auto',
        requestedCpu: 1,
        requestedMemoryGb: 1,
      } as typeof sessionRequests.$inferSelect),
    ).resolves.toBe(false);

    expect(createFromApprovedRequest).not.toHaveBeenCalled();
  });

  it('keeps the grant approved when provisioning fails so the user can retry', async () => {
    const calls: string[] = [];
    const cancelGrantForFailedWorkspace = vi.fn();
    const service = reconcilerWith({
      workspaces: {
        pickWorker: vi.fn().mockResolvedValue({ id: 'worker-1', swarmNodeId: 'node-1' }),
        allocatePort: vi.fn().mockResolvedValue(20000),
        getEnvironmentImage: vi.fn().mockResolvedValue({ imageRef: 'rpl/jupyter-local:dev' }),
        generateJupyterToken: vi.fn().mockResolvedValue({ raw: 'token', hash: 'hash' }),
        createFromApprovedRequest: vi.fn().mockResolvedValue({
          id: 'session-1',
          swarmServiceName: 'rpl-workspace-session-1',
          proxyPath: '/workspaces/request-1',
        }),
        transitionToFailed: vi.fn().mockImplementation(async () => {
          calls.push('transition');
          return true;
        }),
        cancelGrantForFailedWorkspace,
      },
      swarm: {
        findServiceByName: vi.fn().mockResolvedValue(null),
        createService: vi.fn().mockRejectedValue(new Error('swarm down')),
        removeVolume: vi.fn().mockImplementation(async () => {
          calls.push('volume');
        }),
      },
    });
    const provisionOne = (service as unknown as { provisionOne: ProvisionOne }).provisionOne.bind(
      service,
    );

    await expect(
      provisionOne({
        id: 'request-1',
        userId: 'user-1',
        runtimeImageId: 'runtime-1',
        gpuTarget: 'auto',
        requestedCpu: 1,
        requestedMemoryGb: 1,
      } as typeof sessionRequests.$inferSelect),
    ).rejects.toThrow('swarm down');

    expect(calls).toEqual(['transition', 'volume']);
    expect(cancelGrantForFailedWorkspace).not.toHaveBeenCalled();
  });

  it('stops running workspaces after Caddy activity stays idle past the timeout', async () => {
    const transitionToStopping = vi.fn().mockResolvedValue(true);
    const auditRecord = vi.fn();
    const service = reconcilerWith({
      workspaces: {
        findRunning: vi.fn().mockResolvedValue([
          {
            id: 'session-1',
            status: 'running',
            lastActivityAt: new Date(Date.now() - 31 * 60 * 1000),
            startedAt: new Date(Date.now() - 35 * 60 * 1000),
            updatedAt: new Date(Date.now() - 35 * 60 * 1000),
          },
        ]),
        findByStatus: vi
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            {
              id: 'session-1',
              status: 'running',
              lastActivityAt: new Date(Date.now() - 31 * 60 * 1000),
              startedAt: new Date(Date.now() - 35 * 60 * 1000),
              updatedAt: new Date(Date.now() - 35 * 60 * 1000),
            },
          ])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]),
        transitionToStopping,
        listLiveSwarmServiceNames: vi.fn().mockResolvedValue([]),
        listLiveProxyPaths: vi.fn().mockResolvedValue([]),
      },
      swarm: { listPlatformServices: vi.fn().mockResolvedValue([]) },
      db: { withAdvisoryLock: vi.fn(async (_key, callback) => callback()) },
      audit: { record: auditRecord },
      retention: {
        getSettings: vi.fn().mockResolvedValue({ idleStopEnabled: true, idleTimeoutMinutes: 30 }),
      },
      activityLog: { ingest: vi.fn().mockResolvedValue(0) },
    });

    await service.reconcile();

    expect(transitionToStopping).toHaveBeenCalledWith('session-1', 'idle_timeout');
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'workspace-idle-timeout' }),
    );
  });

  it('keeps running workspaces when activity is still fresh', async () => {
    const transitionToStopping = vi.fn();
    const service = reconcilerWith({
      workspaces: {
        findRunning: vi.fn().mockResolvedValue([
          {
            id: 'session-1',
            status: 'running',
            lastActivityAt: new Date(),
            startedAt: new Date(Date.now() - 35 * 60 * 1000),
            updatedAt: new Date(Date.now() - 35 * 60 * 1000),
          },
        ]),
        findByStatus: vi
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            {
              id: 'session-1',
              status: 'running',
              lastActivityAt: new Date(),
              startedAt: new Date(Date.now() - 35 * 60 * 1000),
              updatedAt: new Date(Date.now() - 35 * 60 * 1000),
            },
          ])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]),
        transitionToStopping,
        listLiveSwarmServiceNames: vi.fn().mockResolvedValue([]),
        listLiveProxyPaths: vi.fn().mockResolvedValue([]),
      },
      swarm: { listPlatformServices: vi.fn().mockResolvedValue([]) },
      db: { withAdvisoryLock: vi.fn(async (_key, callback) => callback()) },
      retention: {
        getSettings: vi.fn().mockResolvedValue({ idleStopEnabled: true, idleTimeoutMinutes: 30 }),
      },
      activityLog: { ingest: vi.fn().mockResolvedValue(0) },
    });

    await service.reconcile();

    expect(transitionToStopping).not.toHaveBeenCalled();
  });

  it('removes workspace volume before marking a stopping session stopped', async () => {
    const removeService = vi.fn().mockResolvedValue(undefined);
    const removeVolume = vi.fn().mockResolvedValue(undefined);
    const transitionToStopped = vi.fn().mockResolvedValue(true);
    const service = reconcilerWith({
      workspaces: {
        findByStatus: vi.fn().mockResolvedValue([
          {
            id: 'session-1',
            status: 'stopping',
            swarmServiceId: 'service-1',
            swarmServiceName: 'rpl-workspace-session-1',
            stopReason: 'user_stop',
          },
        ]),
        transitionToStopped,
      },
      swarm: { removeService, removeVolume },
      caddy: { removeRoute: vi.fn().mockResolvedValue(undefined) },
    });
    const stopRequested = (
      service as unknown as { stopRequested: StopRequested }
    ).stopRequested.bind(service);

    await stopRequested();

    expect(removeService).toHaveBeenCalledWith('service-1');
    expect(removeVolume).toHaveBeenCalledWith('rpl-workspace-session-1-data');
    expect(transitionToStopped).toHaveBeenCalledWith('session-1', 'user_stop');
  });
});
