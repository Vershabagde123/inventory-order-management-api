import { prisma } from '../../config/database.js';
import { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../utils/AppError.js';
import { formatMoney, lineTotal, sumMoney } from '../../utils/money.js';
import { buildPaginationMeta, toSkipTake, type PaginationMeta } from '../../utils/pagination.js';
import { MAX_LINE_QUANTITY, type ListOrdersQuery, type OrderItemInput } from './order.validation.js';

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export interface OrderItemDto {
  id: number;
  productId: number;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
}

export interface OrderDto {
  id: number;
  user: { id: number; name: string; email: string };
  totalAmount: string;
  createdAt: Date;
  items: OrderItemDto[];
}

const orderDetailInclude = {
  user: { select: { id: true, name: true, email: true } },
  items: {
    orderBy: { id: 'asc' },
    include: { product: { select: { name: true, sku: true } } },
  },
} satisfies Prisma.OrderInclude;

type OrderWithDetails = Prisma.OrderGetPayload<{ include: typeof orderDetailInclude }>;

export function toOrderDto(order: OrderWithDetails): OrderDto {
  return {
    id: order.id,
    user: order.user,
    totalAmount: formatMoney(order.totalAmount),
    createdAt: order.createdAt,
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.product.name,
      sku: item.product.sku,
      quantity: item.quantity,
      unitPrice: formatMoney(item.price),
      lineTotal: formatMoney(lineTotal(item.price, item.quantity)),
    })),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Merge duplicate product lines (e.g. two lines for product 1 -> one line with
 * the summed quantity) and sort by productId.
 *
 * Sorting gives every transaction the SAME row-lock acquisition order, which
 * prevents deadlocks between concurrent orders touching the same products.
 */
export function aggregateOrderItems(items: OrderItemInput[]): OrderItemInput[] {
  const byProduct = new Map<number, number>();
  for (const { productId, quantity } of items) {
    byProduct.set(productId, (byProduct.get(productId) ?? 0) + quantity);
  }

  const merged = [...byProduct.entries()]
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((a, b) => a.productId - b.productId);

  const tooLarge = merged.filter((i) => i.quantity > MAX_LINE_QUANTITY);
  if (tooLarge.length) {
    throw AppError.badRequest(
      `Combined quantity per product must be at most ${MAX_LINE_QUANTITY}`,
      tooLarge.map((i) => ({
        field: 'items',
        productId: i.productId,
        message: `Combined quantity ${i.quantity} exceeds ${MAX_LINE_QUANTITY}`,
      })),
      'VALIDATION_ERROR',
    );
  }
  return merged;
}

/** Interactive-transaction settings (Neon round-trips + waiting on row locks). */
const ORDER_TX_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  maxWait: 10_000, // max time to obtain a connection from the pool
  timeout: 30_000, // max total transaction duration
} as const;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const orderService = {
  /**
   * Create an order atomically.
   *
   * Everything below runs in ONE database transaction - stock verification,
   * stock deduction, order creation and order-item creation either all commit
   * or all roll back.
   *
   * Concurrency: stock is decremented with a *conditional atomic update*
   *     UPDATE products SET stock = stock - $q WHERE id = $id AND stock >= $q
   * The UPDATE takes a row-level lock. A concurrent transaction updating the
   * same row blocks until the first commits, then PostgreSQL re-evaluates the
   * WHERE clause against the committed row (READ COMMITTED semantics). So two
   * buyers of the last unit can never both succeed - the second sees
   * stock = 0, matches zero rows, and its whole order is rolled back.
   * The CHECK (stock >= 0) constraint is a final safety net.
   */
  async createOrder(userId: number, rawItems: OrderItemInput[]): Promise<OrderDto> {
    const items = aggregateOrderItems(rawItems);
    const productIds = items.map((i) => i.productId);

    const orderId = await prisma.$transaction(async (tx) => {
      // 1. Every product must exist.
      const existing = await tx.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true },
      });
      const existingIds = new Set(existing.map((p) => p.id));
      const missing = productIds.filter((id) => !existingIds.has(id));
      if (missing.length) {
        throw AppError.notFound(
          `Product(s) not found: ${missing.join(', ')}`,
          missing.map((id) => ({ field: 'items', productId: id, message: 'Product not found' })),
        );
      }

      // 2. Verify + deduct stock atomically, row by row, in ascending id order.
      const insufficient: OrderItemInput[] = [];
      for (const item of items) {
        const { count } = await tx.product.updateMany({
          where: { id: item.productId, stock: { gte: item.quantity } },
          data: { stock: { decrement: item.quantity } },
        });
        if (count === 0) insufficient.push(item);
      }

      if (insufficient.length) {
        const current = await tx.product.findMany({
          where: { id: { in: insufficient.map((i) => i.productId) } },
          select: { id: true, name: true, sku: true, stock: true },
        });
        const byId = new Map(current.map((p) => [p.id, p]));
        // Throwing inside the callback rolls back ALL stock changes made above.
        throw AppError.conflict(
          'Insufficient stock for one or more products. The order was not created.',
          'INSUFFICIENT_STOCK',
          insufficient.map((i) => {
            const p = byId.get(i.productId);
            return {
              field: 'items',
              productId: i.productId,
              sku: p?.sku,
              productName: p?.name,
              requested: i.quantity,
              available: p?.stock ?? 0,
              message: `Insufficient stock for ${p?.name ?? `product ${i.productId}`}: requested ${i.quantity}, available ${p?.stock ?? 0}`,
            };
          }),
        );
      }

      // 3. Snapshot prices. These rows are now locked by this transaction, so the
      //    price cannot change between deduction and order creation.
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, price: true },
      });
      const priceById = new Map(products.map((p) => [p.id, p.price]));

      const lines = items.map((item) => {
        const price = priceById.get(item.productId);
        if (!price) throw new Error(`Invariant violated: price missing for ${item.productId}`);
        return { productId: item.productId, quantity: item.quantity, price };
      });

      // 4. Exact decimal total.
      const totalAmount = sumMoney(lines.map((l) => lineTotal(l.price, l.quantity)));

      // 5. Order + items in a single nested write.
      const order = await tx.order.create({
        data: {
          userId,
          totalAmount,
          items: { create: lines },
        },
        select: { id: true },
      });
      return order.id;
    }, ORDER_TX_OPTIONS);

    return orderService.getOrderById(orderId);
  },

  async getOrderById(id: number): Promise<OrderDto> {
    const order = await prisma.order.findUnique({ where: { id }, include: orderDetailInclude });
    if (!order) throw AppError.notFound(`Order with id ${id} not found`);
    return toOrderDto(order);
  },

  async listOrders(query: ListOrdersQuery): Promise<{
    items: Array<Omit<OrderDto, 'items'> & { itemCount: number }>;
    pagination: PaginationMeta;
  }> {
    const [totalRecords, orders] = await prisma.$transaction([
      prisma.order.count(),
      prisma.order.findMany({
        orderBy: { id: 'desc' },
        ...toSkipTake(query.page, query.limit),
        include: {
          user: { select: { id: true, name: true, email: true } },
          _count: { select: { items: true } },
        },
      }),
    ]);

    return {
      items: orders.map((o) => ({
        id: o.id,
        user: o.user,
        totalAmount: formatMoney(o.totalAmount),
        createdAt: o.createdAt,
        itemCount: o._count.items,
      })),
      pagination: buildPaginationMeta(query.page, query.limit, totalRecords),
    };
  },
};
