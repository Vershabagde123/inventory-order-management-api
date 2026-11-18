/**
 * Route-level tests that never reach the database: authentication,
 * authorization and validation all reject the request first.
 */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { signAccessToken } from '../../src/modules/auth/auth.service.js';

const app = createApp();
const staff = `Bearer ${signAccessToken({ id: 2, email: 'staff@test.local', role: 'STAFF' })}`;
const admin = `Bearer ${signAccessToken({ id: 1, email: 'admin@test.local', role: 'ADMIN' })}`;

describe('app wiring', () => {
  it('sets security headers (helmet) and hides x-powered-by', async () => {
    const res = await request(app).get('/does-not-exist');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('returns a JSON 404 for unknown routes', async () => {
    const res = await request(app).get('/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route GET /does-not-exist not found' },
    });
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await request(app)
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});

describe('protected routes require a token', () => {
  it.each([
    ['get', '/products'],
    ['get', '/products/1'],
    ['post', '/products'],
    ['put', '/products/1'],
    ['delete', '/products/1'],
    ['post', '/orders'],
    ['get', '/orders/1'],
    ['get', '/reports/low-stock'],
    ['get', '/users/me'],
  ] as const)('%s %s -> 401', async (method, path) => {
    const res = await request(app)[method](path);
    expect(res.status).toBe(401);
  });
});

describe('STAFF cannot manage products', () => {
  const body = { name: 'Laptop', sku: 'LAP-001', price: 50000, stock: 10 };

  it('POST /products -> 403', async () => {
    const res = await request(app).post('/products').set('Authorization', staff).send(body);
    expect(res.status).toBe(403);
  });

  it('PUT /products/1 -> 403', async () => {
    const res = await request(app).put('/products/1').set('Authorization', staff).send(body);
    expect(res.status).toBe(403);
  });

  it('DELETE /products/1 -> 403', async () => {
    const res = await request(app).delete('/products/1').set('Authorization', staff);
    expect(res.status).toBe(403);
  });
});

describe('validation happens before any database access', () => {
  it('rejects invalid product price for ADMIN with 400', async () => {
    const res = await request(app)
      .post('/products')
      .set('Authorization', admin)
      .send({ name: 'X', sku: 'X-1', price: 0, stock: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('price');
  });

  it('rejects negative stock with 400', async () => {
    const res = await request(app)
      .post('/products')
      .set('Authorization', admin)
      .send({ name: 'X', sku: 'X-1', price: 10, stock: -1 });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('stock');
  });

  it('rejects an empty order with 400', async () => {
    const res = await request(app).post('/orders').set('Authorization', staff).send({ items: [] });
    expect(res.status).toBe(400);
  });

  it('rejects a non-numeric product id with 400', async () => {
    const res = await request(app).get('/products/abc').set('Authorization', staff);
    expect(res.status).toBe(400);
  });

  it('rejects an invalid low-stock threshold with 400', async () => {
    const res = await request(app)
      .get('/reports/low-stock?threshold=-5')
      .set('Authorization', staff);
    expect(res.status).toBe(400);
  });
});
