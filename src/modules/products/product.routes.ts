import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authorize } from '../../middleware/role.middleware.js';
import { productController } from './product.controller.js';

export const productRouter = Router();

// Every product route requires a valid JWT.
productRouter.use(authenticate);

productRouter.get('/', authorize('ADMIN', 'STAFF'), productController.list);
productRouter.get('/:id', authorize('ADMIN', 'STAFF'), productController.getById);
productRouter.post('/', authorize('ADMIN'), productController.create);
productRouter.put('/:id', authorize('ADMIN'), productController.update);
productRouter.delete('/:id', authorize('ADMIN'), productController.remove);
