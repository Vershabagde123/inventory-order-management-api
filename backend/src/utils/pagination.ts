export interface PaginationMeta {
  page: number;
  limit: number;
  totalRecords: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export function buildPaginationMeta(
  page: number,
  limit: number,
  totalRecords: number,
): PaginationMeta {
  const totalPages = totalRecords === 0 ? 0 : Math.ceil(totalRecords / limit);
  return {
    page,
    limit,
    totalRecords,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1 && totalPages > 0,
  };
}

export function toSkipTake(page: number, limit: number) {
  return { skip: (page - 1) * limit, take: limit };
}
