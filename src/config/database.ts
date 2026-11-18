import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { env, isTest } from './env.js';

/**
 * Prisma Client backed by the node-postgres driver adapter.
 *
 * - Runtime traffic uses DATABASE_URL (the Neon *pooled* endpoint, sslmode=require).
 * - Prisma Migrate uses DIRECT_URL (see prisma.config.ts).
 * - In tests, every generated query is qualified with an isolated schema
 *   (TEST_DB_SCHEMA) so application data in "public" is never touched.
 */
function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg(
    {
      connectionString: env.DATABASE_URL,
      max: 10,
      connectionTimeoutMillis: 15_000,
      idleTimeoutMillis: 30_000,
    },
    {
      ...(isTest ? { schema: env.TEST_DB_SCHEMA } : {}),
      onPoolError: (err) => console.error('[db] pool error:', err.message),
    },
  );

  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/** Lightweight connectivity probe used by GET /health. */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
