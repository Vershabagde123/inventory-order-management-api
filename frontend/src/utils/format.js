// Display helpers only - no business rules. Money values arrive from the API as
// exact 2-decimal strings (e.g. "50000.00") and are only formatted for display.

/** Same default threshold the backend's low-stock report uses. */
export const LOW_STOCK_THRESHOLD = 10;

const amountFormat = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatAmount(value) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  return Number.isFinite(n) ? amountFormat.format(n) : String(value);
}

export function formatNumber(value) {
  return new Intl.NumberFormat().format(value ?? 0);
}

export function formatDate(value, withTime = true) {
  if (!value) return '—';
  const d = new Date(value);
  return withTime
    ? d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

/** "799.99" -> 79999 (integer cents) so display estimates never use float math. */
export function toCents(value) {
  const [whole, frac = ''] = String(value).split('.');
  return Number(whole) * 100 + Number((frac + '00').slice(0, 2));
}

export function centsToAmount(cents) {
  return formatAmount((cents / 100).toFixed(2));
}

/** Stock status used for badges and filters. */
export function stockStatus(stock) {
  if (stock <= 0) return { key: 'out', label: 'Out of stock', tone: 'danger' };
  if (stock < LOW_STOCK_THRESHOLD) return { key: 'low', label: 'Low stock', tone: 'warn' };
  return { key: 'in', label: 'In stock', tone: 'success' };
}

export function initials(name = '') {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join('') || '?'
  );
}

/** Map backend validation details ({ field, message }) to { field: message } for inline errors. */
export function fieldErrors(error) {
  const out = {};
  for (const d of error?.details ?? []) {
    const key = String(d.field ?? '').split('.')[0];
    if (key && !out[key]) out[key] = d.message;
  }
  return out;
}
