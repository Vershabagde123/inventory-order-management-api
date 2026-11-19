import { z } from 'zod';

export const DEFAULT_LOW_STOCK_THRESHOLD = 10;

export const lowStockQuerySchema = z.object({
  threshold: z.coerce
    .number({ error: 'threshold must be a number' })
    .int('threshold must be an integer')
    .min(0, 'threshold must be a non-negative integer')
    .max(2_147_483_647, 'threshold is too large')
    .default(DEFAULT_LOW_STOCK_THRESHOLD),
});

export type LowStockQuery = z.infer<typeof lowStockQuerySchema>;
