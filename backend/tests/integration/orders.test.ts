import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/config/database.js';
import { api, dbReady, makeRunId, testContext } from './helpers.js';

const ctx = testContext(makeRunId());

async function stockOf(id: number): Promise<number> {
  return (await prisma.product.findUniqueOrThrow({ where: { id } })).stock;
}

describe.skipIf(!dbReady)('Orders (integration)', () => {
  let staff: Awaited<ReturnType<typeof ctx.createUser>>;
  let admin: Awaited<ReturnType<typeof ctx.createUser>>;

  beforeAll(async () => {
    staff = await ctx.createUser('STAFF');
    admin = await ctx.createUser('ADMIN');
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  describe('successful order', () => {
    let orderId: number;
    let laptop: { id: number };
    let mouse: { id: number };

    it('creates an order, calculates the total and deducts stock', async () => {
      laptop = await ctx.createProduct('LAP', '50000.00', 10, 'Laptop');
      mouse = await ctx.createProduct('MOU', '799.99', 5, 'Mouse');

      const res = await api()
        .post('/orders')
        .set('Authorization', staff.auth)
        .send({
          items: [
            { productId: laptop.id, quantity: 2 },
            { productId: mouse.id, quantity: 3 },
          ],
        });

      expect(res.status).toBe(201);
      // 2 x 50000.00 + 3 x 799.99 = 102399.97 (exact decimal arithmetic)
      expect(res.body.data.totalAmount).toBe('102399.97');
      expect(res.body.data.user).toMatchObject({ id: staff.user.id, email: staff.user.email });
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            productId: laptop.id,
            productName: 'Laptop',
            quantity: 2,
            unitPrice: '50000.00',
            lineTotal: '100000.00',
          }),
          expect.objectContaining({
            productId: mouse.id,
            productName: 'Mouse',
            quantity: 3,
            unitPrice: '799.99',
            lineTotal: '2399.97',
          }),
        ]),
      );
      orderId = res.body.data.id;

      expect(await stockOf(laptop.id)).toBe(8);
      expect(await stockOf(mouse.id)).toBe(2);
    });

    it('retrieves the order by id, with price snapshots unaffected by later price changes', async () => {
      await api()
        .put(`/products/${laptop.id}`)
        .set('Authorization', admin.auth)
        .send({ price: 99999 });

      const res = await api().get(`/orders/${orderId}`).set('Authorization', admin.auth);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ id: orderId, totalAmount: '102399.97' });
      const laptopLine = res.body.data.items.find(
        (i: { productId: number }) => i.productId === laptop.id,
      );
      expect(laptopLine.unitPrice).toBe('50000.00');
      expect(laptopLine.sku).toBe(ctx.sku('LAP'));
    });

    it('lists orders with pagination', async () => {
      const res = await api().get('/orders?limit=5').set('Authorization', staff.auth);
      expect(res.status).toBe(200);
      expect(res.body.pagination).toMatchObject({ page: 1, limit: 5 });
      expect(res.body.data.some((o: { id: number }) => o.id === orderId)).toBe(true);
    });

    it('rejects deleting a product that has been ordered with 409', async () => {
      const res = await api().delete(`/products/${laptop.id}`).set('Authorization', admin.auth);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PRODUCT_IN_USE');
    });
  });

  describe('rollback on insufficient stock', () => {
    it('rejects the whole order and changes nothing (A=10, B=2; request A=2, B=5)', async () => {
      const a = await ctx.createProduct('RB-A', 100, 10);
      const b = await ctx.createProduct('RB-B', 200, 2);
      const ordersBefore = await prisma.order.count({ where: { userId: staff.user.id } });

      const res = await api()
        .post('/orders')
        .set('Authorization', staff.auth)
        .send({
          items: [
            { productId: a.id, quantity: 2 },
            { productId: b.id, quantity: 5 },
          ],
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
      expect(res.body.error.details).toEqual([
        expect.objectContaining({ productId: b.id, requested: 5, available: 2 }),
      ]);

      // Product A's stock was decremented inside the transaction before B failed - it must be rolled back.
      expect(await stockOf(a.id)).toBe(10);
      expect(await stockOf(b.id)).toBe(2);
      expect(await prisma.order.count({ where: { userId: staff.user.id } })).toBe(ordersBefore);
      expect(await prisma.orderItem.count({ where: { productId: { in: [a.id, b.id] } } })).toBe(0);
    });
  });

  describe('invalid requests', () => {
    it('rejects a nonexistent product with 404 and changes nothing', async () => {
      const p = await ctx.createProduct('INV-1', 10, 5);
      const res = await api()
        .post('/orders')
        .set('Authorization', staff.auth)
        .send({
          items: [
            { productId: p.id, quantity: 1 },
            { productId: 2_000_000_000, quantity: 1 },
          ],
        });
      expect(res.status).toBe(404);
      expect(res.body.error.details[0].productId).toBe(2_000_000_000);
      expect(await stockOf(p.id)).toBe(5);
    });

    it.each([
      [{ items: [] }, 'empty order'],
      [{ items: [{ productId: 1, quantity: 0 }] }, 'zero quantity'],
      [{ items: [{ productId: 1, quantity: -1 }] }, 'negative quantity'],
      [{ items: [{ productId: 1, quantity: 1.5 }] }, 'fractional quantity'],
      [{ items: [{ productId: 'x', quantity: 1 }] }, 'invalid product id'],
    ])('rejects %j (%s) with 400', async (body, _label) => {
      const res = await api().post('/orders').set('Authorization', staff.auth).send(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('aggregates duplicate product ids into one line', async () => {
      const p = await ctx.createProduct('DUP-1', '10.50', 5);
      const res = await api()
        .post('/orders')
        .set('Authorization', staff.auth)
        .send({
          items: [
            { productId: p.id, quantity: 2 },
            { productId: p.id, quantity: 1 },
          ],
        });
      expect(res.status).toBe(201);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0]).toMatchObject({ productId: p.id, quantity: 3 });
      expect(res.body.data.totalAmount).toBe('31.50');
      expect(await stockOf(p.id)).toBe(2);
    });

    it('rejects duplicate lines whose combined quantity exceeds stock', async () => {
      const p = await ctx.createProduct('DUP-2', 10, 3);
      const res = await api()
        .post('/orders')
        .set('Authorization', staff.auth)
        .send({
          items: [
            { productId: p.id, quantity: 2 },
            { productId: p.id, quantity: 2 },
          ],
        });
      expect(res.status).toBe(409);
      expect(await stockOf(p.id)).toBe(3);
    });

    it('returns 404 for a missing order', async () => {
      const res = await api().get('/orders/2000000000').set('Authorization', staff.auth);
      expect(res.status).toBe(404);
    });
  });

  describe('concurrency', () => {
    it('two simultaneous orders for the last unit: exactly one succeeds', async () => {
      const p = await ctx.createProduct('LAST-1', 999, 1);
      const other = await ctx.createUser('STAFF');

      const [r1, r2] = await Promise.all([
        api()
          .post('/orders')
          .set('Authorization', staff.auth)
          .send({ items: [{ productId: p.id, quantity: 1 }] }),
        api()
          .post('/orders')
          .set('Authorization', other.auth)
          .send({ items: [{ productId: p.id, quantity: 1 }] }),
      ]);

      expect([r1.status, r2.status].sort()).toEqual([201, 409]);
      expect(await stockOf(p.id)).toBe(0);
      expect(await prisma.orderItem.count({ where: { productId: p.id } })).toBe(1);
    });

    it('many simultaneous orders never oversell and stock never goes negative', async () => {
      const initialStock = 3;
      const p = await ctx.createProduct('RUSH-1', 10, initialStock);

      const results = await Promise.all(
        Array.from({ length: 8 }, () =>
          api()
            .post('/orders')
            .set('Authorization', staff.auth)
            .send({ items: [{ productId: p.id, quantity: 1 }] }),
        ),
      );

      const created = results.filter((r) => r.status === 201).length;
      const rejected = results.filter((r) => r.status === 409).length;
      expect(created).toBe(initialStock);
      expect(rejected).toBe(8 - initialStock);
      expect(await stockOf(p.id)).toBe(0);

      const sold = await prisma.orderItem.aggregate({
        where: { productId: p.id },
        _sum: { quantity: true },
      });
      expect(sold._sum.quantity).toBe(initialStock);
    });
  });
});
