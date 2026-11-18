/**
 * GET /health must report a database failure with 503 (and no connection details).
 * The database probe is mocked to simulate an outage.
 */
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/database.js', () => ({
  prisma: {},
  checkDatabaseConnection: async () => false,
  disconnectDatabase: async () => undefined,
}));

const { createApp } = await import('../../src/app.js');

describe('GET /health when the database is down', () => {
  it('returns 503 with status "degraded"', async () => {
    const res = await request(createApp()).get('/health');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'degraded', database: 'down' });
    expect(JSON.stringify(res.body)).not.toMatch(/postgres|neon|password/i);
  });
});
