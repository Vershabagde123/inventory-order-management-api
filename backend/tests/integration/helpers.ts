/**
 * Integration-test helpers.
 *
 * Safety model:
 *  - All queries go to the isolated TEST_DB_SCHEMA (see src/config/database.ts),
 *    never to the application's "public" schema.
 *  - Every record is tagged with a per-run prefix and cleanup deletes ONLY
 *    records carrying that prefix (no TRUNCATE / reset / DROP anywhere).
 */
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { inject } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { env } from '../../src/config/env.js';
import type { Role } from '../../src/generated/prisma/client.js';
import { signAccessToken } from '../../src/modules/auth/auth.service.js';

if (env.TEST_DB_SCHEMA === 'public') {
  throw new Error('Refusing to run integration tests against the "public" schema');
}

export const dbReady = inject('dbReady');
export const app = createApp();
export const api = () => request(app);

/** Unique per test file run, e.g. "t9k2xq1a". Lower-case so it is valid in emails and SKUs. */
export function makeRunId(): string {
  return `t${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
}

export function testContext(runId: string) {
  const emailDomain = `${runId}.test.local`;
  const skuPrefix = runId.toUpperCase();
  let counter = 0;

  return {
    runId,
    emailDomain,
    skuPrefix,

    email(local = 'user') {
      counter += 1;
      return `${local}${counter}@${emailDomain}`;
    },

    sku(suffix: string) {
      return `${skuPrefix}-${suffix}`.toUpperCase();
    },

    async createUser(role: Role = 'STAFF', password = 'Password123') {
      const user = await prisma.user.create({
        data: {
          name: `${role} ${runId}`,
          email: this.email(role.toLowerCase()),
          password: await bcrypt.hash(password, 4),
          role,
        },
      });
      const token = signAccessToken({ id: user.id, email: user.email, role: user.role });
      return { user, token, auth: `Bearer ${token}` };
    },

    async createProduct(suffix: string, price: string | number, stock: number, name?: string) {
      return prisma.product.create({
        data: { name: name ?? `${runId} ${suffix}`, sku: this.sku(suffix), price, stock },
      });
    },

    /** Delete ONLY records created by this run (children first). */
    async cleanup() {
      const users = await prisma.user.findMany({
        where: { email: { endsWith: `@${emailDomain}` } },
        select: { id: true },
      });
      const userIds = users.map((u) => u.id);
      const products = await prisma.product.findMany({
        where: { sku: { startsWith: `${skuPrefix}-` } },
        select: { id: true },
      });
      const productIds = products.map((p) => p.id);

      // order_items cascade from orders
      await prisma.order.deleteMany({
        where: {
          OR: [{ userId: { in: userIds } }, { items: { some: { productId: { in: productIds } } } }],
        },
      });
      await prisma.product.deleteMany({ where: { id: { in: productIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    },
  };
}

export type TestContext = ReturnType<typeof testContext>;
