import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import { userController } from './user.controller.js';

export const userRouter = Router();

userRouter.get('/me', authenticate, userController.me);
