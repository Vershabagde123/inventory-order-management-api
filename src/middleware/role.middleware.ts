import type { RequestHandler } from 'express';
import type { Role } from '../generated/prisma/client.js';
import { AppError } from '../utils/AppError.js';

/**
 * Role-based authorization. Must run AFTER `authenticate`.
 *   - no authenticated user          -> 401
 *   - user role not in allowed roles -> 403
 */
export function authorize(...allowedRoles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) throw AppError.unauthorized();
    if (!allowedRoles.includes(req.user.role)) {
      throw AppError.forbidden(`This action requires role: ${allowedRoles.join(' or ')}`);
    }
    next();
  };
}
