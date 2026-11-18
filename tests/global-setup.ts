/**
 * Vitest global setup.
 *
 * If real Neon credentials are configured, apply the Prisma migrations to the
 * ISOLATED test schema (TEST_DB_SCHEMA, default "inventory_test") using the
 * non-destructive `prisma migrate deploy`, then expose `dbReady` to the tests.
 * Integration tests are skipped (loudly) when no database is configured.
 */
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    dbReady: boolean;
  }
}

function isPlaceholder(url: string | undefined): boolean {
  return !url || /USER:PASSWORD|ep-xxxx|NEON_.*_CONNECTION_STRING/.test(url);
}

export default function setup(project: TestProject): void {
  const schema = process.env.TEST_DB_SCHEMA ?? 'inventory_test';
  if (schema === 'public' || !/^[a-z_][a-z0-9_]*$/.test(schema)) {
    throw new Error('TEST_DB_SCHEMA must be a simple identifier other than "public".');
  }

  const direct = process.env.DIRECT_URL;
  if (isPlaceholder(process.env.DATABASE_URL) || isPlaceholder(direct)) {
    console.warn(
      '\n[tests] DATABASE_URL / DIRECT_URL are not configured - INTEGRATION TESTS WILL BE SKIPPED.\n',
    );
    project.provide('dbReady', false);
    return;
  }

  const url = new URL(direct as string);
  url.searchParams.set('schema', schema);

  const require = createRequire(import.meta.url);
  const prismaCli = require.resolve('prisma/build/index.js');
  console.log(`[tests] applying migrations to isolated schema "${schema}"...`);
  const result = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: { ...process.env, MIGRATION_DATABASE_URL: url.toString() },
  });
  if (result.status !== 0) {
    throw new Error(`[tests] migrate deploy to schema "${schema}" failed`);
  }
  project.provide('dbReady', true);
}
