import { describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { WorkspacesController } from '@/web/workspaces/workspaces.controller';
import type { WorkspacesService } from '@/domain/workspaces/workspaces.service';
import type { WorkspacesReconcilerService } from '@/domain/workspaces/workspaces-reconciler.service';
import type { AuditService } from '@/infrastructure/audit/audit.service';
import type { AppSession } from '@/core/session';

vi.mock('@/core/render-jsx', () => ({
  renderJsx: vi.fn(),
}));

import { renderJsx } from '@/core/render-jsx';
const renderJsxMock = vi.mocked(renderJsx);

const userSession = {
  userId: 'user-1',
  fullName: 'Student One',
  role: 'user',
} as AppSession;

const mockResponse = { type: vi.fn().mockReturnThis(), send: vi.fn() } as unknown as Response;

function controllerWith(mocks: {
  workspaces?: Partial<WorkspacesService>;
  reconciler?: Partial<WorkspacesReconcilerService>;
  audit?: Partial<AuditService>;
}): WorkspacesController {
  return new WorkspacesController(
    (mocks.workspaces ?? {}) as WorkspacesService,
    (mocks.reconciler ?? {}) as WorkspacesReconcilerService,
    (mocks.audit ?? { record: vi.fn() }) as AuditService,
  );
}

describe('WorkspacesController.start', () => {
  it('redirects lock contention to a start-in-progress message', async () => {
    const controller = controllerWith({
      reconciler: { startApprovedRequest: vi.fn().mockResolvedValue('start-in-progress') },
    });
    const response = { redirect: vi.fn() } as unknown as Response;

    await controller.start(userSession, 'request-1', response);

    expect(response.redirect).toHaveBeenCalledWith('/workspaces/active?message=start-in-progress');
  });
});

describe('WorkspacesController.active', () => {
  it('renders empty workspace page', async () => {
    const controller = controllerWith({
      workspaces: {
        findActiveByUser: vi.fn().mockResolvedValue(null),
      },
    });

    await controller.active(mockResponse, userSession, 'no-capacity');

    expect(renderJsxMock).toHaveBeenCalledWith(
      mockResponse,
      expect.anything(),
      expect.objectContaining({
        fullName: 'Student One',
        isAdmin: false,
        activeWorkspace: null,
        workspaceUrl: null,
        message: 'No GPU node is available right now. Try again later.',
      }),
    );
  });

  it('renders starting workspace state without a Jupyter URL', async () => {
    const controller = controllerWith({
      workspaces: {
        findActiveByUser: vi.fn().mockResolvedValue({
          id: 'session-1',
          userId: 'user-1',
          status: 'starting',
        }),
      },
    });

    await controller.active(mockResponse, userSession);

    expect(renderJsxMock).toHaveBeenCalledWith(
      mockResponse,
      expect.anything(),
      expect.objectContaining({
        activeWorkspace: expect.objectContaining({ id: 'session-1', status: 'starting' }),
        workspaceUrl: null,
      }),
    );
  });

  it('renders running state with a Jupyter link', async () => {
    const controller = controllerWith({
      workspaces: {
        buildJupyterToken: vi.fn().mockReturnValue('token-1'),
        findActiveByUser: vi.fn().mockResolvedValue({
          id: 'session-1',
          requestId: 'grant-1',
          userId: 'user-1',
          status: 'running',
          publishedPort: 19001,
          proxyPath: '/workspaces/session-1',
        }),
      },
    });

    await controller.active(mockResponse, userSession);

    expect(renderJsxMock).toHaveBeenCalledWith(
      mockResponse,
      expect.anything(),
      expect.objectContaining({
        activeWorkspace: expect.objectContaining({ id: 'session-1', status: 'running' }),
        workspaceUrl: expect.stringContaining('/workspaces/session-1/lab?token=token-1'),
      }),
    );
  });
});

describe('WorkspacesController.stop', () => {
  it('records stop audit only when the transition succeeds', async () => {
    const record = vi.fn();
    const controller = controllerWith({
      workspaces: {
        findById: vi
          .fn()
          .mockResolvedValue({ id: 'session-1', userId: 'user-1', status: 'running' }),
        transitionToStopping: vi.fn().mockResolvedValue(true),
      },
      audit: { record },
    });

    await controller.stop(userSession, 'session-1');

    expect(record).toHaveBeenCalledWith({
      actorUserId: 'user-1',
      action: 'workspace-user-stop',
      targetType: 'workspace',
      targetId: 'session-1',
    });
  });

  it('skips stop audit when the transition loses a race', async () => {
    const record = vi.fn();
    const controller = controllerWith({
      workspaces: {
        findById: vi
          .fn()
          .mockResolvedValue({ id: 'session-1', userId: 'user-1', status: 'running' }),
        transitionToStopping: vi.fn().mockResolvedValue(false),
      },
      audit: { record },
    });

    await controller.stop(userSession, 'session-1');

    expect(record).not.toHaveBeenCalled();
  });
});
