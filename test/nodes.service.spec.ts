import { describe, expect, it, vi } from 'vitest';
import { NodesService } from '@/domain/nodes/nodes.service';
import type { NodesRepository } from '@/domain/nodes/nodes.repository';
import type { SwarmService } from '@/infrastructure/swarm/swarm.service';

function serviceWithRows(rows: unknown[]): NodesService {
  return new NodesService(
    { listWithUsageRows: vi.fn().mockResolvedValue(rows) } as unknown as NodesRepository,
    {} as SwarmService,
  );
}

describe('NodesService.listWithUsage', () => {
  it('marks nodes busy and includes current workspace details', async () => {
    const [node] = await serviceWithRows([
      {
        worker: {
          id: 'worker-1',
          name: 'station03',
          enabled: true,
          maintenance: false,
        },
        workspace: {
          id: 'session-1',
          status: 'running',
          startedAt: null,
          expiresAt: null,
        },
        requester: { username: 'student01' },
        environment: { name: 'Local Jupyter' },
      },
    ]).listWithUsage();

    expect(node?.statusLabel).toBe('Busy');
    expect(node?.activeWorkspace).toMatchObject({
      id: 'session-1',
      requester: 'student01',
      environment: 'Local Jupyter',
    });
  });

  it('marks enabled nodes without workspace as free', async () => {
    const [node] = await serviceWithRows([
      {
        worker: {
          id: 'worker-1',
          name: 'station03',
          enabled: true,
          maintenance: false,
        },
        workspace: null,
        requester: null,
        environment: null,
      },
    ]).listWithUsage();

    expect(node?.statusLabel).toBe('Free');
    expect(node?.activeWorkspace).toBeNull();
  });
});
