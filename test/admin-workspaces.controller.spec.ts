import { describe, expect, it, vi } from 'vitest';
import { AdminWorkspacesController } from '@/web/admin/admin-workspaces.controller';
import type { WorkspacesService } from '@/domain/workspaces/workspaces.service';
import type { AuditService } from '@/infrastructure/audit/audit.service';
import type { AppSession } from '@/core/session';

const adminSession = {
  userId: 'admin-1',
  fullName: 'Admin User',
  role: 'admin',
} as AppSession;

function controllerWith(mocks: {
  workspaces: Partial<WorkspacesService>;
  audit: Partial<AuditService>;
}): AdminWorkspacesController {
  return new AdminWorkspacesController(
    mocks.workspaces as WorkspacesService,
    mocks.audit as AuditService,
  );
}

describe('AdminWorkspacesController.stop', () => {
  it('records stop audit only when the transition succeeds', async () => {
    const record = vi.fn();
    const controller = controllerWith({
      workspaces: { transitionToStopping: vi.fn().mockResolvedValue(true) },
      audit: { record },
    });

    await controller.stop(adminSession, 'session-1');

    expect(record).toHaveBeenCalledWith({
      actorUserId: 'admin-1',
      action: 'workspace-admin-stop',
      targetType: 'workspace',
      targetId: 'session-1',
    });
  });

  it('skips stop audit when the transition is a no-op', async () => {
    const record = vi.fn();
    const controller = controllerWith({
      workspaces: { transitionToStopping: vi.fn().mockResolvedValue(false) },
      audit: { record },
    });

    await controller.stop(adminSession, 'session-1');

    expect(record).not.toHaveBeenCalled();
  });
});
