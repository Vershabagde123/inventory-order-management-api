import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/config/database.js';
import { api, dbReady, makeRunId, testContext } from './helpers.js';

const ctx = testContext(makeRunId());

describe.skipIf(!dbReady)('Auth (integration)', () => {
  afterAll(async () => {
    await ctx.cleanup();
  });

  const email = ctx.email('jane');
  const password = 'Password123';

  it('registers a new user as STAFF and never returns the password', async () => {
    const res = await api()
      .post('/auth/register')
      .send({ name: 'Jane Doe', email: email.toUpperCase(), password, role: 'ADMIN' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toMatchObject({ name: 'Jane Doe', email, role: 'STAFF' });
    expect(res.body.data.user).not.toHaveProperty('password');
    expect(JSON.stringify(res.body)).not.toMatch(/\$2[aby]\$/); // no bcrypt hash anywhere
    expect(res.body.data.token).toEqual(expect.any(String));

    // Stored hashed, role forced to STAFF even though ADMIN was requested.
    const stored = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(stored.role).toBe('STAFF');
    expect(stored.password).not.toBe(password);
    expect(stored.password).toMatch(/^\$2[aby]\$/);
  });

  it('rejects duplicate registration with 409 (case-insensitive email)', async () => {
    const res = await api()
      .post('/auth/register')
      .send({ name: 'Jane Again', email: email.toUpperCase(), password });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
  });

  it('rejects invalid registration input with 400', async () => {
    const res = await api()
      .post('/auth/register')
      .send({ name: 'J', email: 'nope', password: '123' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.length).toBeGreaterThanOrEqual(3);
  });

  it('registers with only email and password (as the assignment specifies)', async () => {
    const minimalEmail = ctx.email('minimal');
    const res = await api().post('/auth/register').send({ email: minimalEmail, password });
    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({
      email: minimalEmail,
      role: 'STAFF',
      name: minimalEmail.split('@')[0],
    });

    const login = await api().post('/auth/login').send({ email: minimalEmail, password });
    expect(login.status).toBe(200);
    expect(login.body.data.token).toEqual(expect.any(String));
  });

  it('rejects registration with missing email or password (400)', async () => {
    const noEmail = await api().post('/auth/register').send({ password });
    const noPassword = await api()
      .post('/auth/register')
      .send({ email: ctx.email('nopw') });
    expect(noEmail.status).toBe(400);
    expect(noEmail.body.error.details[0].field).toBe('email');
    expect(noPassword.status).toBe(400);
    expect(noPassword.body.error.details[0].field).toBe('password');
  });

  it('logs in with valid credentials and returns a usable JWT', async () => {
    const res = await api().post('/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.data.tokenType).toBe('Bearer');

    const me = await api().get('/users/me').set('Authorization', `Bearer ${res.body.data.token}`);
    expect(me.status).toBe(200);
    expect(me.body.data).toMatchObject({ email, role: 'STAFF' });
    expect(me.body.data).not.toHaveProperty('password');
  });

  it('rejects a wrong password with 401', async () => {
    const res = await api().post('/auth/login').send({ email, password: 'WrongPass999' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects an unknown email with the same 401 response', async () => {
    const res = await api()
      .post('/auth/login')
      .send({ email: ctx.email('ghost'), password: 'WhateverPass1' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid email or password');
  });

  it('rejects requests without a JWT (401) and with an invalid JWT (401)', async () => {
    expect((await api().get('/products')).status).toBe(401);
    expect((await api().get('/products').set('Authorization', 'Bearer abc.def.ghi')).status).toBe(
      401,
    );
  });
});
