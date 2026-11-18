/**
 * Runs in every test worker BEFORE test files import application modules.
 * Guarantees the env schema can load even without a .env file (e.g. CI unit runs).
 * Real values from .env (loaded by src/config/env.ts via dotenv) are never overridden.
 */
import 'dotenv/config';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://unit:unit@127.0.0.1:5432/unit_tests_no_db';
process.env.JWT_SECRET ??= 'unit-test-secret-that-is-at-least-32-characters-long';
process.env.JWT_EXPIRES_IN ??= '1h';
process.env.TEST_DB_SCHEMA ??= 'inventory_test';

if (process.env.TEST_DB_SCHEMA === 'public') {
  throw new Error('Refusing to run tests against the "public" schema.');
}
