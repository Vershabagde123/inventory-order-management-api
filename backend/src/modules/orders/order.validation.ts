import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/validation.js';

const INT4_MAX = 2_147_483_647;
export const MAX_ORDER_LINES = 100;
export const MAX_LINE_QUANTITY = 10_000;

export const orderItemSchema = z.object({
  productId: z
    .number({ error: 'productId must be a number' })
    .int('productId must be an integer')
    .positive('productId must be a positive integer')
    .max(INT4_MAX, 'productId is out of range'),
  quantity: z
    .number({ error: 'quantity must be a number' })
    .int('quantity must be an integer')
    .positive('quantity must be a positive integer')
    .max(MAX_LINE_QUANTITY, `quantity must be at most ${MAX_LINE_QUANTITY}`),
});

export const createOrderSchema = z.object({
  items: z
    .array(orderItemSchema, { error: 'items must be an array' })
    .min(1, 'Order must contain at least one item')
    .max(MAX_ORDER_LINES, `Order may contain at most ${MAX_ORDER_LINES} items`),
});

export const listOrdersQuerySchema = paginationQuerySchema;

export type OrderItemInput = z.infer<typeof orderItemSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
