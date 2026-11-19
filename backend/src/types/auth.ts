import type { Role } from '../generated/prisma/client.js';

/** Authenticated principal attached to req.user. */
export interface AuthUser {
  id: number;
  email: string;
  role: Role;
}

/** Claims carried in the access token. `sub` is the user id. */
export interface JwtClaims {
  sub: string;
  email: string;
  role: Role;
}
