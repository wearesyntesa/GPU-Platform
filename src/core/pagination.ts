export interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
}

export interface NormalizedPagination {
  page: number;
  pageSize: number;
  offset: number;
}

export function normalizePagination(page: number, pageSize: number): NormalizedPagination {
  const safePage = Math.max(1, page);
  const safePageSize = Math.min(100, Math.max(1, pageSize));

  return {
    page: safePage,
    pageSize: safePageSize,
    offset: (safePage - 1) * safePageSize,
  };
}

export function toPageResult<T>(
  items: T[],
  page: number,
  pageSize: number,
  total: number,
): PageResult<T> {
  return {
    items,
    page,
    pageSize,
    total,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}
