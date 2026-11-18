/**
 * Read-only Neon connectivity check:   npm run db:check
 *
 * Verifies DATABASE_URL (pooled) and DIRECT_URL (direct), reports SSL usage,
 * server version, existing tables and applied migrations.
 * Never prints credentials, host names or full connection strings.
 * Executes only SELECT statements.
 */
import 'dotenv/config';
import pg from 'pg';

interface Target {
  label: string;
  envVar: 'DATABASE_URL' | 'DIRECT_URL';
}

const targets: Target[] = [
  { label: 'Pooled (runtime)', envVar: 'DATABASE_URL' },
  { label: 'Direct (migrations)', envVar: 'DIRECT_URL' },
];

function describeUrl(raw: string) {
  const u = new URL(raw);
  return {
    pooled: u.hostname.includes('-pooler'),
    neon: u.hostname.endsWith('.neon.tech'),
    sslmode: u.searchParams.get('sslmode') ?? '(not set)',
    database: u.pathname.replace(/^\//, ''),
  };
}

async function check(target: Target): Promise<boolean> {
  const raw = process.env[target.envVar];
  if (!raw || /USER:PASSWORD|ep-xxxx|NEON_.*_CONNECTION_STRING/.test(raw)) {
    console.log(`\n[${target.label}] ${target.envVar} is missing or still a placeholder.`);
    return false;
  }

  let info;
  try {
    info = describeUrl(raw);
  } catch {
    console.log(`\n[${target.label}] ${target.envVar} is not a valid URL.`);
    return false;
  }

  console.log(`\n[${target.label}] ${target.envVar}`);
  console.log(
    `  neon host: ${info.neon} | pooled endpoint: ${info.pooled} | sslmode: ${info.sslmode} | database: ${info.database}`,
  );

  const client = new pg.Client({ connectionString: raw, connectionTimeoutMillis: 15_000 });
  try {
    await client.connect();
    const v = await client.query<{ version: string; ssl: boolean | null }>(
      `SELECT current_setting('server_version') AS version,
              (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()) AS ssl`,
    );
    console.log(`  connected: yes | server version: ${v.rows[0]?.version} | ssl: ${v.rows[0]?.ssl}`);

    const tables = await client.query<{ table_schema: string; table_name: string }>(
      `SELECT table_schema, table_name FROM information_schema.tables
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
          AND table_type = 'BASE TABLE'
        ORDER BY table_schema, table_name`,
    );
    const list = tables.rows.map((r) => `${r.table_schema}.${r.table_name}`);
    console.log(`  tables (${list.length}): ${list.length ? list.join(', ') : '(none)'}`);

    const hasMigrations = tables.rows.some(
      (r) => r.table_schema === 'public' && r.table_name === '_prisma_migrations',
    );
    if (hasMigrations) {
      const m = await client.query<{ migration_name: string; finished: boolean }>(
        `SELECT migration_name, finished_at IS NOT NULL AS finished
           FROM public._prisma_migrations ORDER BY started_at`,
      );
      for (const row of m.rows) {
        console.log(`  migration: ${row.migration_name} (${row.finished ? 'applied' : 'NOT finished'})`);
      }
    }
    return true;
  } catch (err) {
    // pg error messages do not include the password; still keep it short.
    const e = err as { code?: string; message?: string };
    console.log(`  connected: NO (${e.code ?? 'error'}: ${e.message ?? 'unknown error'})`);
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

const results = [];
for (const t of targets) results.push(await check(t));
process.exitCode = results.every(Boolean) ? 0 : 1;
