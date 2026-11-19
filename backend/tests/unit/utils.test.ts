import { describe, expect, it } from 'vitest';
import { aggregateOrderItems } from '../../src/modules/orders/order.service.js';
import { AppError } from '../../src/utils/AppError.js';
import { formatMoney, lineTotal, sumMoney, toDecimal } from '../../src/utils/money.js';
import { buildPaginationMeta, toSkipTake } from '../../src/utils/pagination.js';

describe('money utils', () => {
  it('avoids floating point errors', () => {
    // 0.1 + 0.2 !== 0.3 in IEEE-754 floats
    expect(formatMoney(sumMoney([toDecimal('0.1'), toDecimal('0.2')]))).toBe('0.30');
  });

  it('computes exact line totals and sums', () => {
    const total = sumMoney([lineTotal('50000.00', 2), lineTotal('799.99', 3)]);
    expect(formatMoney(total)).toBe('102399.97');
  });
});

describe('pagination utils', () => {
  it('builds metadata', () => {
    expect(buildPaginationMeta(2, 10, 25)).toEqual({
      page: 2,
      limit: 10,
      totalRecords: 25,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: true,
    });
    expect(buildPaginationMeta(1, 10, 0)).toMatchObject({ totalPages: 0, hasNextPage: false });
  });

  it('computes skip/take', () => {
    expect(toSkipTake(3, 10)).toEqual({ skip: 20, take: 10 });
  });
});

describe('aggregateOrderItems', () => {
  it('merges duplicate product ids and sorts by id (consistent lock order)', () => {
    expect(
      aggregateOrderItems([
        { productId: 5, quantity: 1 },
        { productId: 2, quantity: 3 },
        { productId: 5, quantity: 4 },
      ]),
    ).toEqual([
      { productId: 2, quantity: 3 },
      { productId: 5, quantity: 5 },
    ]);
  });

  it('rejects a combined quantity that exceeds the per-line maximum', () => {
    expect(() =>
      aggregateOrderItems([
        { productId: 1, quantity: 6000 },
        { productId: 1, quantity: 6000 },
      ]),
    ).toThrow(AppError);
  });
});
