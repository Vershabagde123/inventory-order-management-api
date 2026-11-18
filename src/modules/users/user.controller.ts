import type { Request, Response } from 'express';
import { AppError } from '../../utils/AppError.js';
import { toPublicUser, userService } from './user.service.js';

export const userController = {
  /** GET /users/me - profile of the authenticated user. */
  async me(req: Request, res: Response): Promise<void> {
    if (!req.user) throw AppError.unauthorized();
    const user = await userService.findById(req.user.id);
    if (!user) throw AppError.unauthorized('User no longer exists');
    res.status(200).json({ success: true, data: toPublicUser(user) });
  },
};
