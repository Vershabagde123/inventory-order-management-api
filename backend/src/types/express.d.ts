import type { AuthUser } from './auth.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by the authenticate middleware after the JWT is verified. */
      user?: AuthUser;
    }
  }
}

export {};
