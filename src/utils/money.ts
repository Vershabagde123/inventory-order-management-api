import { Prisma } from '../generated/prisma/client.js';

/**
 * Money is handled with Prisma.Decimal (decimal.js) end-to-end - never with
 * JavaScript floats - and stored as NUMERIC(12,2)/NUMERIC(14,2) in Postgres.
 */
export type Money = Prisma.Decimal;

export function toDecimal(value: Prisma.Decimal | string | number): Money {
  return new Prisma.Decimal(value);
}

/** Format a money value as a fixed 2-decimal string, e.g. "50000.00". */
export function formatMoney(value: Prisma.Decimal | string | number): string {
  return new Prisma.Decimal(value).toFixed(2);
}

/** Exact line total: unitPrice x quantity. */
export function lineTotal(unitPrice: Prisma.Decimal | string | number, quantity: number): Money {
  return new Prisma.Decimal(unitPrice).mul(quantity);
}

/** Exact sum of decimal values. */
export function sumMoney(values: Money[]): Money {
  return values.reduce<Money>((acc, v) => acc.add(v), new Prisma.Decimal(0));
}
