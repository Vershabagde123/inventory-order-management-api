import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Prisma CLI configuration (Prisma 7).
 *
 * Migrations must run over Neon's DIRECT (non-pooled) endpoint, because
 * PgBouncer transaction pooling is not suitable for schema migrations.
 * The application itself uses DATABASE_URL (pooled) - see src/config/database.ts.
 *
 * MIGRATION_DATABASE_URL lets scripts (e.g. the test-schema migrator) point the
 * CLI at a different target without editing .env.
 *
 * `prisma generate` does not need a database, so the URL may be empty at build time.
 */
const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DIRECT_URL ?? '';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url,
  },
});
