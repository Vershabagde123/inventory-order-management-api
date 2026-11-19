import type { Request, Response } from 'express';
import { idParamSchema } from '../../utils/validation.js';
import { productService } from './product.service.js';
import {
  createProductSchema,
  listProductsQuerySchema,
  updateProductSchema,
} from './product.validation.js';

export const productController = {
  /** POST /products (ADMIN) */
  async create(req: Request, res: Response): Promise<void> {
    const input = createProductSchema.parse(req.body);
    const product = await productService.create(input);
    res.status(201).json({ success: true, data: product });
  },

  /** GET /products?page=&limit=&search= (ADMIN, STAFF) */
  async list(req: Request, res: Response): Promise<void> {
    const query = listProductsQuerySchema.parse(req.query);
    const { items, pagination } = await productService.list(query);
    res.status(200).json({ success: true, data: items, pagination });
  },

  /** GET /products/:id (ADMIN, STAFF) */
  async getById(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const product = await productService.getById(id);
    res.status(200).json({ success: true, data: product });
  },

  /** PUT /products/:id (ADMIN) */
  async update(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = updateProductSchema.parse(req.body);
    const product = await productService.update(id, input);
    res.status(200).json({ success: true, data: product });
  },

  /** DELETE /products/:id (ADMIN) */
  async remove(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    await productService.remove(id);
    res.status(204).send();
  },
};
