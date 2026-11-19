/**
 * node-postgres currently treats sslmode=require|prefer|verify-ca as verify-full
 * (full certificate + hostname verification) and logs a deprecation warning for them.
 * Neon URLs use sslmode=require, so we state the strict mode explicitly for the
 * runtime pool: same security behaviour, no warning, and future-proof against pg v9
 * downgrading `require` to libpq semantics.
 */
export function withStrictSsl(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    const mode = url.searchParams.get('sslmode');
    if (mode === 'require' || mode === 'prefer' || mode === 'verify-ca') {
      url.searchParams.set('sslmode', 'verify-full');
    }
    return url.toString();
  } catch {
    return connectionString;
  }
}
