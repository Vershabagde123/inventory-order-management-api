import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/validation.js';

const INT4_MAX = 2_147_483_647;
/** NUMERIC(12,2): up to 10 integer digits and 2 decimals. */
const PRICE_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

/**
 * Price accepts a JSON number (50000, 199.99) or a numeric string ("199.99").
 * It is kept as a string so it can be converted to an exact Decimal - never a float.
 */
export const priceSchema = z
  .union([z.number({ error: 'price must be a number' }).finite(), z.string().trim()], {
    error: 'price must be a number',
  })
  .transform((v) => String(v))
  .refine((v) => PRICE_PATTERN.test(v), {
    message: 'price must be a positive amount with at most 2 decimal places',
  })
  .refine((v) => Number(v) > 0, { message: 'price must be greater than 0' });

export const stockSchema = z
  .number({ error: 'stock must be a number' })
  .int('stock must be an integer')
  .min(0, 'stock must be a non-negative integer')
  .max(INT4_MAX, 'stock is too large');

const nameSchema = z
  .string({ error: 'name is required' })
  .trim()
  .min(1, 'name is required')
  .max(200, 'name must be at most 200 characters');

/** SKUs are normalised to upper case, so "lap-001" and "LAP-001" are the same SKU. */
const skuSchema = z
  .string({ error: 'sku is required' })
  .trim()
  .min(1, 'sku is required')
  .max(64, 'sku must be at most 64 characters')
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/,
    'sku may contain only letters, digits, "-" and "_" and must start with a letter or digit',
  )
  .transform((v) => v.toUpperCase());

export const createProductSchema = z.object({
  name: nameSchema,
  sku: skuSchema,
  price: priceSchema,
  stock: stockSchema,
});

/** PUT accepts any subset of fields, but at least one. */
export const updateProductSchema = z
  .object({
    name: nameSchema.optional(),
    sku: skuSchema.optional(),
    price: priceSchema.optional(),
    stock: stockSchema.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'At least one field (name, sku, price, stock) must be provided',
  });

export const listProductsQuerySchema = paginationQuerySchema.extend({
  search: z
    .string()
    .trim()
    .max(100, 'search must be at most 100 characters')
    .optional()
    .transform((v) => (v ? v : undefined)),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
