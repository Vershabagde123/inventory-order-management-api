import type { RequestHandler } from 'express';
import { verifyAccessToken } from '../modules/auth/auth.service.js';
import { AppError } from '../utils/AppError.js';

/**
 * Requires a valid `Authorization: Bearer <JWT>` header.
 * Missing, malformed, invalid or expired tokens -> 401.
 */
export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header) {
    throw AppError.unauthorized('Missing Authorization header', 'MISSING_TOKEN');
  }

  const [scheme, token, ...rest] = header.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== 'bearer' || !token || rest.length > 0) {
    throw AppError.unauthorized(
      'Authorization header must be in the format: Bearer <token>',
      'INVALID_TOKEN',
    );
  }

  req.user = verifyAccessToken(token);
  next();
};
