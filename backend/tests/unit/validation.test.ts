import { describe, expect, it } from 'vitest';
import { loginSchema, registerSchema } from '../../src/modules/auth/auth.validation.js';
import { createOrderSchema } from '../../src/modules/orders/order.validation.js';
import {
  createProductSchema,
  listProductsQuerySchema,
  updateProductSchema,
} from '../../src/modules/products/product.validation.js';
import { lowStockQuerySchema } from '../../src/modules/reports/report.validation.js';
import { idParamSchema } from '../../src/utils/validation.js';

describe('auth validation', () => {
  it('normalises email and strips any client-supplied role', () => {
    const parsed = registerSchema.parse({
      name: '  Jane  ',
      email: '  Jane@Example.COM ',
      password: 'Secret123',
      role: 'ADMIN',
    });
    expect(parsed).toEqual({ name: 'Jane', email: 'jane@example.com', password: 'Secret123' });
    expect(parsed).not.toHaveProperty('role');
  });

  it.each([
    [{ name: 'J', email: 'a@b.com', password: 'Secret123' }, 'name'],
    [{ name: 'Jane', email: 'not-an-email', password: 'Secret123' }, 'email'],
    [{ name: 'Jane', email: 'a@b.com', password: 'short1' }, 'password'],
    [{ name: 'Jane', email: 'a@b.com', password: 'onlyletters' }, 'password'],
    [{ name: 'Jane', email: 'a@b.com', password: `${'a1'.repeat(37)}` }, 'password'],
  ])('rejects invalid registration %#', (body, field) => {
    const result = registerSchema.safeParse(body);
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.path[0] === field)).toBe(true);
  });

  it('requires email and password for login', () => {
    expect(loginSchema.safeParse({}).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'x' }).success).toBe(true);
  });
});

describe('product validation', () => {
  const valid = { name: 'Laptop', sku: 'lap-001', price: 50000, stock: 10 };

  it('accepts a valid product and upper-cases the SKU', () => {
    expect(createProductSchema.parse(valid)).toEqual({
      name: 'Laptop',
      sku: 'LAP-001',
      price: '50000',
      stock: 10,
    });
  });

  it('accepts decimal prices as numbers or strings', () => {
    expect(createProductSchema.parse({ ...valid, price: 199.99 }).price).toBe('199.99');
    expect(createProductSchema.parse({ ...valid, price: '0.50' }).price).toBe('0.50');
  });

  it.each([0, -1, '0', 'abc', 1.234, 1e12, null])('rejects invalid price %s', (price) => {
    expect(createProductSchema.safeParse({ ...valid, price }).success).toBe(false);
  });

  it.each([-1, 1.5, '10', null])('rejects invalid stock %s', (stock) => {
    expect(createProductSchema.safeParse({ ...valid, stock }).success).toBe(false);
  });

  it('accepts stock of zero', () => {
    expect(createProductSchema.safeParse({ ...valid, stock: 0 }).success).toBe(true);
  });

  it.each([
    { ...valid, name: '' },
    { ...valid, name: '   ' },
    { ...valid, sku: '' },
    { ...valid, sku: 'bad sku!' },
  ])('rejects missing/invalid name or sku %#', (body) => {
    expect(createProductSchema.safeParse(body).success).toBe(false);
  });

  it('update requires at least one field', () => {
    expect(updateProductSchema.safeParse({}).success).toBe(false);
    expect(updateProductSchema.safeParse({ stock: 5 }).success).toBe(true);
  });

  it('applies pagination defaults and limits', () => {
    expect(listProductsQuerySchema.parse({})).toEqual({ page: 1, limit: 10, search: undefined });
    expect(listProductsQuerySchema.parse({ page: '2', limit: '5', search: ' lap ' })).toEqual({
      page: 2,
      limit: 5,
      search: 'lap',
    });
    expect(listProductsQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
    expect(listProductsQuerySchema.safeParse({ page: '0' }).success).toBe(false);
  });
});

describe('order validation', () => {
  it('accepts a valid order', () => {
    expect(
      createOrderSchema.safeParse({
        items: [
          { productId: 1, quantity: 2 },
          { productId: 2, quantity: 1 },
        ],
      }).success,
    ).toBe(true);
  });

  it.each([
    [{ items: [] }, 'empty items'],
    [{}, 'missing items'],
    [{ items: [{ productId: 1, quantity: 0 }] }, 'zero quantity'],
    [{ items: [{ productId: 1, quantity: -2 }] }, 'negative quantity'],
    [{ items: [{ productId: 1, quantity: 1.5 }] }, 'fractional quantity'],
    [{ items: [{ productId: 0, quantity: 1 }] }, 'zero productId'],
    [{ items: [{ productId: 'abc', quantity: 1 }] }, 'string productId'],
    [{ items: [{ quantity: 1 }] }, 'missing productId'],
  ])('rejects %j (%s)', (body, _label) => {
    expect(createOrderSchema.safeParse(body).success).toBe(false);
  });
});

describe('report & id validation', () => {
  it('defaults threshold to 10 and validates it', () => {
    expect(lowStockQuerySchema.parse({})).toEqual({ threshold: 10 });
    expect(lowStockQuerySchema.parse({ threshold: '5' })).toEqual({ threshold: 5 });
    expect(lowStockQuerySchema.safeParse({ threshold: '-1' }).success).toBe(false);
    expect(lowStockQuerySchema.safeParse({ threshold: 'abc' }).success).toBe(false);
    expect(lowStockQuerySchema.safeParse({ threshold: '2.5' }).success).toBe(false);
  });

  it('validates id params', () => {
    expect(idParamSchema.parse({ id: '42' })).toEqual({ id: 42 });
    expect(idParamSchema.safeParse({ id: 'abc' }).success).toBe(false);
    expect(idParamSchema.safeParse({ id: '0' }).success).toBe(false);
    expect(idParamSchema.safeParse({ id: '99999999999' }).success).toBe(false);
  });
});
