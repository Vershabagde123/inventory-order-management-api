import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { env } from '../../src/config/env.js';
import { Prisma } from '../../src/generated/prisma/client.js';
import { authenticate } from '../../src/middleware/auth.middleware.js';
import { errorHandler, toAppError } from '../../src/middleware/error.middleware.js';
import { authorize } from '../../src/middleware/role.middleware.js';
import { signAccessToken, verifyAccessToken } from '../../src/modules/auth/auth.service.js';
import { AppError } from '../../src/utils/AppError.js';

function testApp() {
  const app = express();
  app.get('/protected', authenticate, (req, res) => {
    res.json({ user: req.user });
  });
  app.get('/admin-only', authenticate, authorize('ADMIN'), (_req, res) => {
    res.json({ ok: true });
  });
  app.get('/boom', () => {
    throw new Error('secret internal detail');
  });
  app.use(errorHandler);
  return app;
}

const staffToken = signAccessToken({ id: 7, email: 'staff@test.local', role: 'STAFF' });
const adminToken = signAccessToken({ id: 1, email: 'admin@test.local', role: 'ADMIN' });

describe('JWT helpers', () => {
  it('signs a token with id, email and role claims', () => {
    const decoded = jwt.decode(staffToken) as jwt.JwtPayload;
    expect(decoded.sub).toBe('7');
    expect(decoded.email).toBe('staff@test.local');
    expect(decoded.role).toBe('STAFF');
    expect(decoded.exp).toBeGreaterThan(decoded.iat as number);
    expect(verifyAccessToken(staffToken)).toEqual({
      id: 7,
      email: 'staff@test.local',
      role: 'STAFF',
    });
  });

  it('rejects tokens with tampered/unknown role claims', () => {
    const bad = jwt.sign({ email: 'x@y.z', role: 'SUPERUSER' }, env.JWT_SECRET, { subject: '1' });
    expect(() => verifyAccessToken(bad)).toThrow(AppError);
  });

  it('rejects the "none" algorithm', () => {
    const unsigned = jwt.sign({ email: 'x@y.z', role: 'ADMIN' }, '', {
      algorithm: 'none',
      subject: '1',
    });
    expect(() => verifyAccessToken(unsigned)).toThrow(AppError);
  });
});

describe('authenticate middleware', () => {
  const app = testApp();

  it('401 when the token is missing', async () => {
    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ success: false, error: { code: 'MISSING_TOKEN' } });
  });

  it('401 when the scheme is not Bearer', async () => {
    const res = await request(app).get('/protected').set('Authorization', `Basic ${staffToken}`);
    expect(res.status).toBe(401);
  });

  it('401 for an invalid token', async () => {
    const res = await request(app).get('/protected').set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('401 for a token signed with another secret', async () => {
    const forged = jwt.sign({ email: 'a@b.c', role: 'ADMIN' }, 'x'.repeat(40), { subject: '1' });
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it('401 for an expired token', async () => {
    const expired = jwt.sign(
      { email: 'a@b.c', role: 'STAFF', exp: Math.floor(Date.now() / 1000) - 60 },
      env.JWT_SECRET,
      { subject: '1' },
    );
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('attaches req.user for a valid token', async () => {
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ id: 7, email: 'staff@test.local', role: 'STAFF' });
  });
});

describe('authorize middleware', () => {
  const app = testApp();

  it('403 when the role is insufficient', async () => {
    const res = await request(app).get('/admin-only').set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('allows the permitted role', async () => {
    const res = await request(app).get('/admin-only').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});

describe('error middleware', () => {
  it('hides internal error messages behind a generic 500', async () => {
    const res = await request(testApp()).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error).toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
    });
    expect(JSON.stringify(res.body)).not.toContain('secret internal detail');
  });

  it('maps ZodError to 400 with field details', () => {
    const result = z.object({ name: z.string() }).safeParse({});
    const mapped = toAppError(result.error);
    expect(mapped?.statusCode).toBe(400);
    expect(mapped?.code).toBe('VALIDATION_ERROR');
    expect(mapped?.details?.[0]?.field).toBe('name');
  });

  it.each([
    ['P2002', 409],
    ['P2003', 409],
    ['P2025', 404],
    ['P2034', 409],
    ['P2028', 503],
  ])('maps Prisma %s to HTTP %i', (code, status) => {
    const err = new Prisma.PrismaClientKnownRequestError('db error', {
      code,
      clientVersion: 'test',
    });
    expect(toAppError(err)?.statusCode).toBe(status);
  });

  it('returns null for unknown errors (=> 500)', () => {
    expect(toAppError(new Error('x'))).toBeNull();
  });
});
