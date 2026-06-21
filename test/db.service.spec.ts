import { beforeEach, describe, expect, it, vi } from 'vitest';

const poolMocks = vi.hoisted(() => ({
  connect: vi.fn(),
  end: vi.fn(),
  Pool: vi.fn(),
}));

vi.mock('pg', () => ({
  Pool: poolMocks.Pool.mockImplementation(() => ({
    connect: poolMocks.connect,
    end: poolMocks.end,
  })),
}));

describe('DbService.withAdvisoryLock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('configures bounded pool timeouts', async () => {
    const { DbService } = await import('@/infrastructure/db/db.service');

    new DbService();

    expect(poolMocks.Pool).toHaveBeenCalledWith(
      expect.objectContaining({
        max: 5,
        connectionTimeoutMillis: 3000,
        idleTimeoutMillis: 30000,
        maxLifetimeSeconds: 300,
      }),
    );
  });

  it('closes the pool on module destroy', async () => {
    const { DbService } = await import('@/infrastructure/db/db.service');
    const service = new DbService();

    await service.onModuleDestroy();

    expect(poolMocks.end).toHaveBeenCalledWith();
  });

  it('returns null when the advisory lock is already held', async () => {
    const { DbService } = await import('@/infrastructure/db/db.service');
    const release = vi.fn();
    poolMocks.connect.mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [{ locked: false }] }),
      release,
    });

    const service = new DbService();
    const result = await service.withAdvisoryLock(42, async () => 'done');

    expect(result).toBeNull();
    expect(release).toHaveBeenCalledWith();
  });

  it('preserves the work error when advisory unlock fails', async () => {
    const { DbService } = await import('@/infrastructure/db/db.service');
    const workError = new Error('work failed');
    const unlockError = new Error('unlock failed');
    const release = vi.fn();
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ locked: true }] })
      .mockRejectedValueOnce(unlockError);
    poolMocks.connect.mockResolvedValue({ query, release });

    const service = new DbService();

    await expect(
      service.withAdvisoryLock(42, async () => {
        throw workError;
      }),
    ).rejects.toThrow(workError);
    expect(release).toHaveBeenCalledWith(unlockError);
  });

  it('returns the work result when unlock cleanup fails after success', async () => {
    const { DbService } = await import('@/infrastructure/db/db.service');
    const unlockError = new Error('unlock failed');
    const release = vi.fn();
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ locked: true }] })
      .mockRejectedValueOnce(unlockError);
    poolMocks.connect.mockResolvedValue({ query, release });

    const service = new DbService();
    const result = await service.withAdvisoryLock(42, async () => 'done');

    expect(result).toBe('done');
    expect(release).toHaveBeenCalledWith(unlockError);
  });
});
