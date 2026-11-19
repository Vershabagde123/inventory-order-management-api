import type { Request, Response } from 'express';
import { AppError } from '../../utils/AppError.js';
import { idParamSchema } from '../../utils/validation.js';
import { orderService } from './order.service.js';
import { createOrderSchema, listOrdersQuerySchema } from './order.validation.js';

export const orderController = {
  /** POST /orders (ADMIN, STAFF) */
  async create(req: Request, res: Response): Promise<void> {
    if (!req.user) throw AppError.unauthorized();
    const { items } = createOrderSchema.parse(req.body);
    const order = await orderService.createOrder(req.user.id, items);
    res.status(201).json({ success: true, data: order });
  },

  /** GET /orders/:id (ADMIN, STAFF) */
  async getById(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const order = await orderService.getOrderById(id);
    res.status(200).json({ success: true, data: order });
  },

  /** GET /orders?page=&limit= (ADMIN, STAFF) */
  async list(req: Request, res: Response): Promise<void> {
    const query = listOrdersQuerySchema.parse(req.query);
    const { items, pagination } = await orderService.listOrders(query);
    res.status(200).json({ success: true, data: items, pagination });
  },
};
