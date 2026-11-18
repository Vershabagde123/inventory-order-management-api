import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authorize } from '../../middleware/role.middleware.js';
import { reportController } from './report.controller.js';

export const reportRouter = Router();

reportRouter.use(authenticate, authorize('ADMIN', 'STAFF'));

reportRouter.get('/low-stock', reportController.lowStock);
