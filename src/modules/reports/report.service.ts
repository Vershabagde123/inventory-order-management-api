import { prisma } from '../../config/database.js';
import { formatMoney } from '../../utils/money.js';

export interface LowStockItem {
  id: number;
  name: string;
  sku: string;
  price: string;
  stock: number;
}

export const reportService = {
  /** Products whose stock is STRICTLY below the threshold, lowest stock first. */
  async lowStock(threshold: number): Promise<LowStockItem[]> {
    const products = await prisma.product.findMany({
      where: { stock: { lt: threshold } },
      orderBy: [{ stock: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, sku: true, price: true, stock: true },
    });
    return products.map((p) => ({ ...p, price: formatMoney(p.price) }));
  },
};
