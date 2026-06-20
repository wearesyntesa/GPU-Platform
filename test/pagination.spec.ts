import { describe, expect, it } from 'vitest';
import { normalizePagination, toPageResult } from '@/core/pagination';

describe('pagination helpers', () => {
  it('normalizes invalid page values and clamps page size', () => {
    expect(normalizePagination(0, 999)).toEqual({ page: 1, pageSize: 100, offset: 0 });
  });

  it('computes offset from normalized page and page size', () => {
    expect(normalizePagination(3, 25)).toEqual({ page: 3, pageSize: 25, offset: 50 });
  });

  it('builds page result with at least one page', () => {
    expect(toPageResult([], 1, 20, 0)).toEqual({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      pageCount: 1,
    });
  });
});
