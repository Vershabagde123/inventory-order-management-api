/**
 * Unit tests for the order logic (orderService.createOrder) with the database mocked.
 *
 * The fake Prisma client keeps products in memory. `$transaction(cb)` snapshots
 * product stock and restores it if `cb` throws, mirroring a database rollback, so
 * these tests verify the service's own contract:
 *   - it throws INSIDE the transaction callback on any failure (=> rollback)
 *   - it never creates an order when any line fails
 *   - it deducts stock with conditional updates, in ascending product-id order
 *   - it aggregates duplicate lines and computes exact decimal totals
 * The real-database behaviour (row locks, concurrency) is covered in tests/integration.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../src/generated/prisma/client.js';
import { AppError } from '../../src/utils/AppError.js';

interface FakeProduct {
  id: number;
  name: string;
  sku: string;
  price: Prisma.Decimal;
  stock: number;
}
interface FakeOrder {
  id: number;
  userId: number;
  totalAmount: Prisma.Decimal;
  createdAt: Date;
  items: Array<{ productId: number; quantity: number; price: Prisma.Decimal }>;
}

const db = vi.hoisted(() => ({
  products: new Map<number, FakeProduct>(),
  orders: [] as FakeOrder[],
  updateCalls: [] as Array<{ id: number; quantity: number }>,
  orderCreateCalls: 0,
  txOptions: [] as unknown[],
}));

vi.mock('../../src/config/database.js', () => {
  const pick = (p: FakeProduct, select?: Record<string, boolean>) =>
    select ? Object.fromEntries(Object.keys(select).map((k) => [k, p[k as keyof FakeProduct]])) : p;

  const tx = {
    product: {
      findMany: async (args: {
        where: { id: { in: number[] } };
        select?: Record<string, boolean>;
      }) =>
        args.where.id.in
          .map((id) => db.products.get(id))
          .filter((p): p is FakeProduct => Boolean(p))
          .map((p) => pick(p, args.select)),
      updateMany: async (args: {
        where: { id: number; stock: { gte: number } };
        data: { stock: { decrement: number } };
      }) => {
        db.updateCalls.push({ id: args.where.id, quantity: args.data.stock.decrement });
        const p = db.products.get(args.where.id);
        if (!p || p.stock < args.where.stock.gte) return { count: 0 };
        p.stock -= args.data.stock.decrement;
        return { count: 1 };
      },
    },
    order: {
      create: async (args: {
        data: {
          userId: number;
          totalAmount: Prisma.Decimal;
          items: { create: FakeOrder['items'] };
        };
      }) => {
        db.orderCreateCalls += 1;
        const order: FakeOrder = {
          id: db.orders.length + 1,
          userId: args.data.userId,
          totalAmount: args.data.totalAmount,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          items: args.data.items.create,
        };
        db.orders.push(order);
        return { id: order.id };
      },
    },
  };

  const prisma = {
    $transaction: async (cb: (t: typeof tx) => Promise<unknown>, options: unknown) => {
      db.txOptions.push(options);
      const stockSnapshot = new Map([...db.products].map(([id, p]) => [id, p.stock]));
      const ordersSnapshot = db.orders.length;
      try {
        return await cb(tx);
      } catch (err) {
        // Simulated ROLLBACK
        for (const [id, stock] of stockSnapshot) db.products.get(id)!.stock = stock;
        db.orders.length = ordersSnapshot;
        throw err;
      }
    },
    order: {
      findUnique: async (args: { where: { id: number } }) => {
        const o = db.orders.find((x) => x.id === args.where.id);
        if (!o) return null;
        return {
          ...o,
          user: { id: o.userId, name: 'Unit User', email: 'unit@test.local' },
          items: o.items.map((item, i) => {
            const p = db.products.get(item.productId)!;
            return { id: i + 1, orderId: o.id, ...item, product: { name: p.name, sku: p.sku } };
          }),
        };
      },
    },
  };

  return {
    prisma,
    checkDatabaseConnection: async () => true,
    disconnectDatabase: async () => undefined,
  };
});

// Import AFTER the mock is registered.
const { orderService } = await import('../../src/modules/orders/order.service.js');

function seed(...products: Array<[id: number, price: string, stock: number]>) {
  for (const [id, price, stock] of products) {
    db.products.set(id, {
      id,
      name: `Product ${id}`,
      sku: `SKU-${id}`,
      price: new Prisma.Decimal(price),
      stock,
    });
  }
}

const stock = (id: number) => db.products.get(id)?.stock;

beforeEach(() => {
  db.products.clear();
  db.orders.length = 0;
  db.updateCalls.length = 0;
  db.orderCreateCalls = 0;
  db.txOptions.length = 0;
});

describe('orderService.createOrder (unit, mocked DB)', () => {
  it('creates the order, deducts stock and computes an exact total', async () => {
    seed([1, '50000.00', 10], [2, '0.10', 5], [3, '0.20', 5]);

    const order = await orderService.createOrder(42, [
      { productId: 1, quantity: 2 },
      { productId: 2, quantity: 1 },
      { productId: 3, quantity: 1 },
    ]);

    // 100000.00 + 0.10 + 0.20 - would be 100000.30000000001 with floats
    expect(order.totalAmount).toBe('100000.30');
    expect(order.items).toEqual([
      expect.objectContaining({
        productId: 1,
        productName: 'Product 1',
        quantity: 2,
        unitPrice: '50000.00',
        lineTotal: '100000.00',
      }),
      expect.objectContaining({ productId: 2, quantity: 1, unitPrice: '0.10', lineTotal: '0.10' }),
      expect.objectContaining({ productId: 3, quantity: 1, unitPrice: '0.20', lineTotal: '0.20' }),
    ]);
    expect([stock(1), stock(2), stock(3)]).toEqual([8, 4, 4]);
    expect(db.orders[0]?.userId).toBe(42);
  });

  it('runs inside ONE transaction with READ COMMITTED isolation', async () => {
    seed([1, '10.00', 5]);
    await orderService.createOrder(1, [{ productId: 1, quantity: 1 }]);
    expect(db.txOptions).toHaveLength(1);
    expect(db.txOptions[0]).toMatchObject({ isolationLevel: 'ReadCommitted' });
  });

  it('rejects the whole order with 409 when any item has too little stock, changing nothing', async () => {
    seed([1, '100.00', 10], [2, '200.00', 2]);

    const err = await orderService
      .createOrder(1, [
        { productId: 1, quantity: 2 },
        { productId: 2, quantity: 5 },
      ])
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ statusCode: 409, code: 'INSUFFICIENT_STOCK' });
    expect((err as AppError).details).toEqual([
      expect.objectContaining({ productId: 2, requested: 5, available: 2 }),
    ]);
    // Product 1 was decremented first; the throw inside the transaction must undo it.
    expect(db.updateCalls.map((c) => c.id)).toEqual([1, 2]);
    expect([stock(1), stock(2)]).toEqual([10, 2]);
    expect(db.orderCreateCalls).toBe(0);
    expect(db.orders).toHaveLength(0);
  });

  it('reports every insufficient line, not just the first', async () => {
    seed([1, '1.00', 0], [2, '1.00', 1]);
    const err = (await orderService
      .createOrder(1, [
        { productId: 1, quantity: 1 },
        { productId: 2, quantity: 2 },
      ])
      .catch((e: unknown) => e)) as AppError;
    expect(err.details?.map((d) => d.productId)).toEqual([1, 2]);
  });

  it('rejects unknown products with 404 before touching stock', async () => {
    seed([1, '1.00', 5]);
    const err = await orderService
      .createOrder(1, [
        { productId: 1, quantity: 1 },
        { productId: 99, quantity: 1 },
      ])
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ statusCode: 404 });
    expect((err as AppError).details?.[0]).toMatchObject({ productId: 99 });
    expect(db.updateCalls).toHaveLength(0);
    expect(stock(1)).toBe(5);
    expect(db.orderCreateCalls).toBe(0);
  });

  it('deducts stock in ascending product-id order (consistent lock order, no deadlocks)', async () => {
    seed([3, '1.00', 5], [1, '1.00', 5], [2, '1.00', 5]);
    await orderService.createOrder(1, [
      { productId: 3, quantity: 1 },
      { productId: 1, quantity: 1 },
      { productId: 2, quantity: 1 },
    ]);
    expect(db.updateCalls.map((c) => c.id)).toEqual([1, 2, 3]);
  });

  it('aggregates duplicate product lines into a single conditional update', async () => {
    seed([1, '10.50', 5]);
    const order = await orderService.createOrder(1, [
      { productId: 1, quantity: 2 },
      { productId: 1, quantity: 1 },
    ]);
    expect(db.updateCalls).toEqual([{ id: 1, quantity: 3 }]);
    expect(order.items).toHaveLength(1);
    expect(order.totalAmount).toBe('31.50');
    expect(stock(1)).toBe(2);
  });

  it('allows ordering exactly the remaining stock (boundary)', async () => {
    seed([1, '5.00', 3]);
    await orderService.createOrder(1, [{ productId: 1, quantity: 3 }]);
    expect(stock(1)).toBe(0);
  });

  it('getOrderById throws 404 for a missing order', async () => {
    await expect(orderService.getOrderById(12345)).rejects.toMatchObject({ statusCode: 404 });
  });
});
