import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, dbReady, makeRunId, testContext } from './helpers.js';

const ctx = testContext(makeRunId());

describe.skipIf(!dbReady)('Products (integration)', () => {
  let admin: string;
  let staff: string;

  beforeAll(async () => {
    admin = (await ctx.createUser('ADMIN')).auth;
    staff = (await ctx.createUser('STAFF')).auth;
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  describe('ADMIN can manage products', () => {
    let productId: number;

    it('creates a product (201)', async () => {
      const res = await api()
        .post('/products')
        .set('Authorization', admin)
        .send({ name: 'Laptop', sku: ctx.sku('lap-001'), price: 50000, stock: 10 });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        name: 'Laptop',
        sku: ctx.sku('LAP-001'),
        price: '50000.00',
        stock: 10,
      });
      productId = res.body.data.id;
    });

    it('rejects a duplicate SKU with 409 (case-insensitive)', async () => {
      const res = await api()
        .post('/products')
        .set('Authorization', admin)
        .send({ name: 'Other', sku: ctx.sku('LAP-001').toLowerCase(), price: 10, stock: 1 });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SKU_ALREADY_EXISTS');
    });

    it('rejects an invalid price with 400', async () => {
      const res = await api()
        .post('/products')
        .set('Authorization', admin)
        .send({ name: 'Bad', sku: ctx.sku('BAD-1'), price: -5, stock: 1 });
      expect(res.status).toBe(400);
    });

    it('rejects negative stock with 400', async () => {
      const res = await api()
        .post('/products')
        .set('Authorization', admin)
        .send({ name: 'Bad', sku: ctx.sku('BAD-2'), price: 5, stock: -1 });
      expect(res.status).toBe(400);
    });

    it('gets a product by id', async () => {
      const res = await api().get(`/products/${productId}`).set('Authorization', staff);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(productId);
    });

    it('updates a product (PUT, partial fields)', async () => {
      const res = await api()
        .put(`/products/${productId}`)
        .set('Authorization', admin)
        .send({ price: '45999.50', stock: 7 });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ price: '45999.50', stock: 7, name: 'Laptop' });
    });

    it('rejects updating to a SKU that already exists with 409', async () => {
      const other = await ctx.createProduct('OTHER-1', 10, 1);
      const res = await api()
        .put(`/products/${productId}`)
        .set('Authorization', admin)
        .send({ sku: other.sku });
      expect(res.status).toBe(409);
    });

    it('STAFF cannot create, update or delete (403)', async () => {
      const body = { name: 'X', sku: ctx.sku('STAFF-X'), price: 1, stock: 1 };
      expect((await api().post('/products').set('Authorization', staff).send(body)).status).toBe(
        403,
      );
      expect(
        (await api().put(`/products/${productId}`).set('Authorization', staff).send(body)).status,
      ).toBe(403);
      expect(
        (await api().delete(`/products/${productId}`).set('Authorization', staff)).status,
      ).toBe(403);
      // Unchanged
      const after = await api().get(`/products/${productId}`).set('Authorization', staff);
      expect(after.body.data.stock).toBe(7);
    });

    it('deletes a product (204) and then returns 404', async () => {
      const del = await api().delete(`/products/${productId}`).set('Authorization', admin);
      expect(del.status).toBe(204);
      const res = await api().get(`/products/${productId}`).set('Authorization', admin);
      expect(res.status).toBe(404);
    });
  });

  describe('not found', () => {
    const missing = 2_000_000_000;

    it('GET/PUT/DELETE a nonexistent product -> 404', async () => {
      expect((await api().get(`/products/${missing}`).set('Authorization', admin)).status).toBe(
        404,
      );
      expect(
        (await api().put(`/products/${missing}`).set('Authorization', admin).send({ stock: 1 }))
          .status,
      ).toBe(404);
      expect((await api().delete(`/products/${missing}`).set('Authorization', admin)).status).toBe(
        404,
      );
    });
  });

  describe('pagination and search', () => {
    beforeAll(async () => {
      // 5 products with this run's unique prefix in both name and SKU.
      await ctx.createProduct('PG-1', 100, 5, `${ctx.runId} Mouse Gaming`);
      await ctx.createProduct('PG-2', 200, 5, `${ctx.runId} Mouse Office`);
      await ctx.createProduct('PG-3', 300, 5, `${ctx.runId} Keyboard`);
      await ctx.createProduct('PG-4', 400, 5, `${ctx.runId} Monitor`);
      await ctx.createProduct('PG-5', 500, 5, `${ctx.runId} Webcam`);
    });

    it('paginates results with metadata', async () => {
      const search = `${ctx.skuPrefix}-PG-`;
      const page1 = await api()
        .get(`/products?page=1&limit=2&search=${encodeURIComponent(search)}`)
        .set('Authorization', staff);
      expect(page1.status).toBe(200);
      expect(page1.body.data).toHaveLength(2);
      expect(page1.body.pagination).toEqual({
        page: 1,
        limit: 2,
        totalRecords: 5,
        totalPages: 3,
        hasNextPage: true,
        hasPreviousPage: false,
      });

      const page3 = await api()
        .get(`/products?page=3&limit=2&search=${encodeURIComponent(search)}`)
        .set('Authorization', staff);
      expect(page3.body.data).toHaveLength(1);
      expect(page3.body.pagination.hasNextPage).toBe(false);

      const ids = [...page1.body.data, ...page3.body.data].map((p: { id: number }) => p.id);
      expect(new Set(ids).size).toBe(3);
    });

    it('searches by name (case-insensitive)', async () => {
      const res = await api()
        .get(`/products?search=${encodeURIComponent(`${ctx.runId} MOUSE`.toUpperCase())}`)
        .set('Authorization', staff);
      expect(res.status).toBe(200);
      expect(res.body.data.map((p: { name: string }) => p.name).sort()).toEqual([
        `${ctx.runId} Mouse Gaming`,
        `${ctx.runId} Mouse Office`,
      ]);
    });

    it('searches by SKU (case-insensitive)', async () => {
      const res = await api()
        .get(`/products?search=${encodeURIComponent(ctx.sku('pg-4').toLowerCase())}`)
        .set('Authorization', staff);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].sku).toBe(ctx.sku('PG-4'));
    });

    it('returns an empty page when nothing matches', async () => {
      const res = await api()
        .get(`/products?search=${ctx.runId}-nothing-matches`)
        .set('Authorization', staff);
      expect(res.body.data).toEqual([]);
      expect(res.body.pagination.totalRecords).toBe(0);
    });

    it('rejects a limit above the maximum with 400', async () => {
      const res = await api().get('/products?limit=1000').set('Authorization', staff);
      expect(res.status).toBe(400);
    });
  });
});
