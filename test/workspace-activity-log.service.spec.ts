import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  WorkspaceActivityLogService,
  workspaceSessionIdFromAccessLogLine,
} from '@/domain/workspaces/workspace-activity-log.service';
import type { WorkspacesService } from '@/domain/workspaces/workspaces.service';
import { env } from '@/core/config/env';

describe('workspace activity log parsing', () => {
  it('extracts workspace session ids from Caddy JSON access log lines', () => {
    expect(
      workspaceSessionIdFromAccessLogLine(
        JSON.stringify({
          request: { uri: '/workspaces/12345678-1234-1234-1234-123456789abc/lab' },
        }),
      ),
    ).toBe('12345678-1234-1234-1234-123456789abc');
    expect(workspaceSessionIdFromAccessLogLine('{bad json')).toBeNull();
    expect(
      workspaceSessionIdFromAccessLogLine(JSON.stringify({ request: { uri: '/healthz' } })),
    ).toBeNull();
  });

  it('marks activity for workspace requests found since the previous ingest', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'rpl-activity-log-'));
    const logPath = join(dir, 'access.json');
    const markActivity = vi.fn().mockResolvedValue(1);
    env.caddyAccessLogPath = logPath;

    await writeFile(
      logPath,
      `${JSON.stringify({
        request: { uri: '/workspaces/12345678-1234-1234-1234-123456789abc/lab' },
      })}\n`,
    );

    const service = new WorkspaceActivityLogService({
      markActivity,
    } as unknown as WorkspacesService);
    await expect(service.ingest()).resolves.toBe(1);
    await expect(service.ingest()).resolves.toBe(0);
    expect(markActivity).toHaveBeenCalledTimes(1);
    expect(markActivity).toHaveBeenCalledWith(['12345678-1234-1234-1234-123456789abc']);
  });
});
