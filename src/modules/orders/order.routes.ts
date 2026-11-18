import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authorize } from '../../middleware/role.middleware.js';
import { orderController } from './order.controller.js';

export const orderRouter = Router();

orderRouter.use(authenticate, authorize('ADMIN', 'STAFF'));

orderRouter.post('/', orderController.create);
orderRouter.get('/', orderController.list);
orderRouter.get('/:id', orderController.getById);
