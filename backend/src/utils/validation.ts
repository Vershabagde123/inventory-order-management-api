import { z } from 'zod';

const INT4_MAX = 2_147_483_647;

/** Positive integer id (Postgres INT4), accepting numeric strings (route params). */
export const idSchema = z.coerce
  .number({ error: 'ID must be a number' })
  .int('ID must be an integer')
  .positive('ID must be a positive integer')
  .max(INT4_MAX, 'ID is out of range');

export const idParamSchema = z.object({ id: idSchema });

export const PAGINATION_DEFAULT_LIMIT = 10;
export const PAGINATION_MAX_LIMIT = 100;

export const paginationQuerySchema = z.object({
  page: z.coerce
    .number({ error: 'page must be a number' })
    .int('page must be an integer')
    .min(1, 'page must be >= 1')
    .max(1_000_000, 'page is too large')
    .default(1),
  limit: z.coerce
    .number({ error: 'limit must be a number' })
    .int('limit must be an integer')
    .min(1, 'limit must be >= 1')
    .max(PAGINATION_MAX_LIMIT, `limit must be <= ${PAGINATION_MAX_LIMIT}`)
    .default(PAGINATION_DEFAULT_LIMIT),
});
