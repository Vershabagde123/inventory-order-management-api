import type { Request, Response } from 'express';
import { authService } from './auth.service.js';
import { loginSchema, registerSchema } from './auth.validation.js';

export const authController = {
  /** POST /auth/register */
  async register(req: Request, res: Response): Promise<void> {
    const input = registerSchema.parse(req.body);
    const result = await authService.register(input);
    res.status(201).json({ success: true, data: result });
  },

  /** POST /auth/login */
  async login(req: Request, res: Response): Promise<void> {
    const input = loginSchema.parse(req.body);
    const result = await authService.login(input);
    res.status(200).json({ success: true, data: result });
  },
};
