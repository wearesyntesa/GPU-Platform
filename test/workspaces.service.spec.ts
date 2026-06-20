import { describe, expect, it } from 'vitest';
import { isWildcardGpuTarget, workspaceOccupiesNode } from '@/domain/workspaces/workspaces.service';
import { WorkspacesService } from '@/domain/workspaces/workspaces.service';
import type { WorkspacesRepository } from '@/domain/workspaces/workspaces.repository';

describe('isWildcardGpuTarget', () => {
  it.each(['auto', 'any', '', '  '])('treats %j as wildcard node selection', (target) => {
    expect(isWildcardGpuTarget(target)).toBe(true);
  });

  it('requires exact GPU type matching for explicit targets', () => {
    expect(isWildcardGpuTarget('rtx-4090')).toBe(false);
  });
});

describe('workspaceOccupiesNode', () => {
  it.each(['starting', 'running', 'stopping'] as const)(
    'treats %s workspace as occupying a node',
    (status) => {
      expect(workspaceOccupiesNode(status)).toBe(true);
    },
  );

  it.each(['stopped', 'failed', 'expired'] as const)(
    'treats %s workspace as not occupying a node',
    (status) => {
      expect(workspaceOccupiesNode(status)).toBe(false);
    },
  );
});

describe('WorkspacesService.transitionToStopping', () => {
  function serviceReturning(rows: { id: string }[]): WorkspacesService {
    return new WorkspacesService({
      transitionToStopping: async () => rows.length > 0,
    } as unknown as WorkspacesRepository);
  }

  it('returns true when a starting or running session is updated to stopping', async () => {
    await expect(
      serviceReturning([{ id: 'session-1' }]).transitionToStopping('session-1', 'user_stopped'),
    ).resolves.toBe(true);
  });

  it('returns false when no row is eligible for transition to stopping', async () => {
    await expect(
      serviceReturning([]).transitionToStopping('session-1', 'user_stopped'),
    ).resolves.toBe(false);
  });
});
