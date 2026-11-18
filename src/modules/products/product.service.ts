import { prisma } from '../../config/database.js';
import { Prisma, type Product } from '../../generated/prisma/client.js';
import { AppError } from '../../utils/AppError.js';
import { formatMoney } from '../../utils/money.js';
import { buildPaginationMeta, toSkipTake, type PaginationMeta } from '../../utils/pagination.js';
import type {
  CreateProductInput,
  ListProductsQuery,
  UpdateProductInput,
} from './product.validation.js';

export interface ProductDto {
  id: number;
  name: string;
  sku: string;
  price: string;
  stock: number;
  createdAt: Date;
  updatedAt: Date;
}

export function toProductDto(p: Product): ProductDto {
  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    price: formatMoney(p.price),
    stock: p.stock,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function isPrismaError(err: unknown, code: string): err is Prisma.PrismaClientKnownRequestError {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === code;
}

function skuConflict(sku: string) {
  return AppError.conflict(`A product with SKU "${sku}" already exists`, 'SKU_ALREADY_EXISTS');
}

function productNotFound(id: number) {
  return AppError.notFound(`Product with id ${id} not found`);
}

export const productService = {
  async create(input: CreateProductInput): Promise<ProductDto> {
    try {
      const product = await prisma.product.create({
        data: {
          name: input.name,
          sku: input.sku,
          price: new Prisma.Decimal(input.price),
          stock: input.stock,
        },
      });
      return toProductDto(product);
    } catch (err) {
      if (isPrismaError(err, 'P2002')) throw skuConflict(input.sku);
      throw err;
    }
  },

  async list(query: ListProductsQuery): Promise<{ items: ProductDto[]; pagination: PaginationMeta }> {
    const where: Prisma.ProductWhereInput = query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { sku: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {};

    // Count and page are read in one transaction so they are consistent with each other.
    const [totalRecords, products] = await prisma.$transaction([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        orderBy: { id: 'asc' },
        ...toSkipTake(query.page, query.limit),
      }),
    ]);

    return {
      items: products.map(toProductDto),
      pagination: buildPaginationMeta(query.page, query.limit, totalRecords),
    };
  },

  async getById(id: number): Promise<ProductDto> {
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) throw productNotFound(id);
    return toProductDto(product);
  },

  async update(id: number, input: UpdateProductInput): Promise<ProductDto> {
    const data: Prisma.ProductUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.sku !== undefined) data.sku = input.sku;
    if (input.price !== undefined) data.price = new Prisma.Decimal(input.price);
    if (input.stock !== undefined) data.stock = input.stock;

    try {
      const product = await prisma.product.update({ where: { id }, data });
      return toProductDto(product);
    } catch (err) {
      if (isPrismaError(err, 'P2025')) throw productNotFound(id);
      if (isPrismaError(err, 'P2002')) throw skuConflict(input.sku ?? '');
      throw err;
    }
  },

  async remove(id: number): Promise<void> {
    try {
      await prisma.product.delete({ where: { id } });
    } catch (err) {
      if (isPrismaError(err, 'P2025')) throw productNotFound(id);
      if (isPrismaError(err, 'P2003')) {
        throw AppError.conflict(
          `Product ${id} cannot be deleted because it is referenced by existing orders`,
          'PRODUCT_IN_USE',
        );
      }
      throw err;
    }
  },
};
