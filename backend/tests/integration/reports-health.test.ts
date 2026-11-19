import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, dbReady, makeRunId, testContext } from './helpers.js';

const ctx = testContext(makeRunId());

interface LowStockRow {
  id: number;
  name: string;
  sku: string;
  price: string;
  stock: number;
}

describe.skipIf(!dbReady)('Low-stock report (integration)', () => {
  let staff: string;
  let ids: { zero: number; three: number; nine: number; ten: number; fifty: number };

  beforeAll(async () => {
    staff = (await ctx.createUser('STAFF')).auth;
    ids = {
      zero: (await ctx.createProduct('LS-0', '5.00', 0)).id,
      three: (await ctx.createProduct('LS-3', '15.25', 3)).id,
      nine: (await ctx.createProduct('LS-9', 20, 9)).id,
      ten: (await ctx.createProduct('LS-10', 20, 10)).id,
      fifty: (await ctx.createProduct('LS-50', 20, 50)).id,
    };
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  const mine = (rows: LowStockRow[]) => rows.filter((r) => r.sku.startsWith(ctx.skuPrefix));

  it('uses a default threshold of 10 (strictly below)', async () => {
    const res = await api().get('/reports/low-stock').set('Authorization', staff);
    expect(res.status).toBe(200);
    expect(res.body.threshold).toBe(10);

    const rows = mine(res.body.data);
    expect(rows.map((r) => r.id)).toEqual([ids.zero, ids.three, ids.nine]); // ordered by stock asc
    expect(rows[1]).toEqual({
      id: ids.three,
      name: `${ctx.runId} LS-3`,
      sku: ctx.sku('LS-3'),
      price: '15.25',
      stock: 3,
    });
    // Every returned product (including pre-existing ones) is strictly below the threshold.
    expect(res.body.data.every((r: LowStockRow) => r.stock < 10)).toBe(true);
  });

  it('supports a custom threshold', async () => {
    const res = await api().get('/reports/low-stock?threshold=4').set('Authorization', staff);
    expect(res.status).toBe(200);
    expect(mine(res.body.data).map((r) => r.id)).toEqual([ids.zero, ids.three]);

    const res11 = await api().get('/reports/low-stock?threshold=11').set('Authorization', staff);
    expect(mine(res11.body.data).map((r) => r.id)).toContain(ids.ten);
    expect(mine(res11.body.data).map((r) => r.id)).not.toContain(ids.fifty);
  });

  it('returns an empty array when nothing matches', async () => {
    // stock can never be < 0 (CHECK constraint), so threshold=0 always yields no rows.
    const res = await api().get('/reports/low-stock?threshold=0').set('Authorization', staff);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.count).toBe(0);
  });

  it('validates the threshold', async () => {
    for (const bad of ['-1', 'abc', '1.5']) {
      const res = await api()
        .get(`/reports/low-stock?threshold=${bad}`)
        .set('Authorization', staff);
      expect(res.status).toBe(400);
    }
  });

  it('requires authentication', async () => {
    expect((await api().get('/reports/low-stock')).status).toBe(401);
  });
});

describe.skipIf(!dbReady)('Health check (integration)', () => {
  it('reports the API and database as up without leaking connection details', async () => {
    const res = await api().get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'up' });
    expect(JSON.stringify(res.body)).not.toMatch(/postgres|neon|password/i);
  });
});
