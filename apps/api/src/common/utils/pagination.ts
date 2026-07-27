export interface PageParams {
  page?: number;
  limit?: number;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function normalizePage(params?: PageParams, defaultLimit = 50, maxLimit = 200) {
  const page = Math.max(1, params?.page ?? 1);
  const limit = Math.min(Math.max(1, params?.limit ?? defaultLimit), maxLimit);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

export function toPageResult<T>(items: T[], total: number, page: number, limit: number): PageResult<T> {
  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}
