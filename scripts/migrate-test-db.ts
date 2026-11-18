/**
 * Apply the Prisma migrations to the ISOLATED test schema:   npm run test:db:migrate
 *
 * Uses DIRECT_URL with `?schema=<TEST_DB_SCHEMA>` so the tables are created in
 * e.g. "inventory_test" instead of "public". Uses `prisma migrate deploy`
 * (non-destructive, never resets). The connection string is never printed.
 */
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const schema = process.env.TEST_DB_SCHEMA ?? 'inventory_test';
if (!/^[a-z_][a-z0-9_]*$/.test(schema) || schema === 'public') {
  console.error('TEST_DB_SCHEMA must be a simple lowercase identifier other than "public".');
  process.exit(1);
}

const base = process.env.DIRECT_URL;
if (!base) {
  console.error('DIRECT_URL is not set. Add the Neon DIRECT connection string to .env.');
  process.exit(1);
}

const url = new URL(base);
url.searchParams.set('schema', schema);

const require = createRequire(import.meta.url);
const prismaCli = require.resolve('prisma/build/index.js');

console.log(`[test-db] applying migrations to isolated schema "${schema}"...`);
const result = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
  stdio: 'inherit',
  env: { ...process.env, MIGRATION_DATABASE_URL: url.toString() },
});
process.exit(result.status ?? 1);
