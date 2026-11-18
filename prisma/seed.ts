/**
 * Idempotent database seed.
 *
 *   npm run db:seed
 *
 * - Creates ONE admin user from ADMIN_NAME / ADMIN_EMAIL / ADMIN_PASSWORD.
 *   Running it again never creates a duplicate and never overwrites the password.
 * - Optionally inserts sample products (SEED_SAMPLE_PRODUCTS=true). Existing
 *   SKUs are left untouched, so real stock levels are never reset.
 *
 * Nothing in this script deletes or truncates data.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../src/config/database.js';
import { env } from '../src/config/env.js';

const seedEnvSchema = z.object({
  ADMIN_NAME: z.string().trim().min(1).max(100).default('System Admin'),
  ADMIN_EMAIL: z.email('ADMIN_EMAIL must be a valid email').trim().toLowerCase(),
  ADMIN_PASSWORD: z
    .string()
    .min(8, 'ADMIN_PASSWORD must be at least 8 characters')
    .max(72, 'ADMIN_PASSWORD must be at most 72 characters')
    .refine((v) => !/REPLACE_WITH|SECURE_ADMIN_PASSWORD/.test(v), {
      message: 'ADMIN_PASSWORD still contains the placeholder value - set a real password',
    }),
  SEED_SAMPLE_PRODUCTS: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

const sampleProducts = [
  { name: 'Laptop', sku: 'LAP-001', price: '50000.00', stock: 10 },
  { name: 'Wireless Mouse', sku: 'MOU-001', price: '799.00', stock: 50 },
  { name: 'Mechanical Keyboard', sku: 'KEY-001', price: '3499.00', stock: 25 },
  { name: '27" Monitor', sku: 'MON-001', price: '18999.00', stock: 5 },
  { name: 'USB-C Hub', sku: 'HUB-001', price: '1499.00', stock: 3 },
];

async function main(): Promise<void> {
  const parsed = seedEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid seed configuration:\n${issues.join('\n')}`);
  }
  const cfg = parsed.data;

  // --- Admin user -----------------------------------------------------------
  const existing = await prisma.user.findUnique({ where: { email: cfg.ADMIN_EMAIL } });
  if (!existing) {
    const password = await bcrypt.hash(cfg.ADMIN_PASSWORD, env.BCRYPT_SALT_ROUNDS);
    await prisma.user.create({
      data: { name: cfg.ADMIN_NAME, email: cfg.ADMIN_EMAIL, password, role: 'ADMIN' },
    });
    console.log(`[seed] admin user created (${cfg.ADMIN_EMAIL})`);
  } else if (existing.role === 'ADMIN') {
    console.log(`[seed] admin user already exists (${cfg.ADMIN_EMAIL}) - skipped`);
  } else {
    // Do NOT silently promote: someone may have publicly registered this email.
    console.warn(
      `[seed] WARNING: ${cfg.ADMIN_EMAIL} exists with role ${existing.role}. ` +
        'It was NOT promoted to ADMIN. Use a different ADMIN_EMAIL or promote it manually.',
    );
  }

  // --- Sample products ----------------------------------------------------
  if (cfg.SEED_SAMPLE_PRODUCTS) {
    const result = await prisma.product.createMany({
      data: sampleProducts,
      skipDuplicates: true, // existing SKUs are left untouched
    });
    console.log(`[seed] sample products inserted: ${result.count} (existing SKUs skipped)`);
  }
}

main()
  .catch((err: unknown) => {
    console.error('[seed] failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
