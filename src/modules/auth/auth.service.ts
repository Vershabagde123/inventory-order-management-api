import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { Prisma, type Role } from '../../generated/prisma/client.js';
import type { AuthUser, JwtClaims } from '../../types/auth.js';
import { AppError } from '../../utils/AppError.js';
import { toPublicUser, userService, type PublicUser } from '../users/user.service.js';
import type { LoginInput, RegisterInput } from './auth.validation.js';

const JWT_ALGORITHM = 'HS256' as const;
const ROLES: readonly Role[] = ['ADMIN', 'STAFF'];

// Used to equalise response time when the email does not exist (mitigates user enumeration).
let dummyHash: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  dummyHash ??= bcrypt.hash('dummy-password-for-timing', env.BCRYPT_SALT_ROUNDS);
  return dummyHash;
}

export interface AuthResult {
  user: PublicUser;
  token: string;
  tokenType: 'Bearer';
  expiresIn: string;
}

export function signAccessToken(user: AuthUser): string {
  const claims: Omit<JwtClaims, 'sub'> = { email: user.email, role: user.role };
  return jwt.sign(claims, env.JWT_SECRET, {
    algorithm: JWT_ALGORITHM,
    subject: String(user.id),
    expiresIn: env.JWT_EXPIRES_IN as NonNullable<SignOptions['expiresIn']>,
  });
}

/**
 * Verify a token and return the principal. Throws AppError(401) for
 * missing/invalid/expired tokens or tokens with malformed claims.
 */
export function verifyAccessToken(token: string): AuthUser {
  let decoded: string | jwt.JwtPayload;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw AppError.unauthorized('Token has expired', 'TOKEN_EXPIRED');
    }
    throw AppError.unauthorized('Invalid token', 'INVALID_TOKEN');
  }

  if (typeof decoded === 'string') throw AppError.unauthorized('Invalid token', 'INVALID_TOKEN');

  const id = Number(decoded.sub);
  const { email, role } = decoded as Partial<JwtClaims>;
  if (
    !Number.isInteger(id) ||
    id <= 0 ||
    typeof email !== 'string' ||
    !ROLES.includes(role as Role)
  ) {
    throw AppError.unauthorized('Invalid token claims', 'INVALID_TOKEN');
  }
  return { id, email, role: role as Role };
}

function buildAuthResult(user: Parameters<typeof toPublicUser>[0]): AuthResult {
  return {
    user: toPublicUser(user),
    token: signAccessToken({ id: user.id, email: user.email, role: user.role }),
    tokenType: 'Bearer',
    expiresIn: env.JWT_EXPIRES_IN,
  };
}

export const authService = {
  /** Public self-registration. Role is ALWAYS STAFF - admins are created by the seed. */
  async register(input: RegisterInput): Promise<AuthResult> {
    const existing = await userService.findByEmail(input.email);
    if (existing) {
      throw AppError.conflict('An account with this email already exists', 'EMAIL_ALREADY_EXISTS');
    }

    const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_SALT_ROUNDS);
    try {
      const user = await userService.create({
        name: input.name,
        email: input.email,
        passwordHash,
        role: 'STAFF',
      });
      return buildAuthResult(user);
    } catch (err) {
      // Two concurrent registrations with the same email: unique index wins.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw AppError.conflict(
          'An account with this email already exists',
          'EMAIL_ALREADY_EXISTS',
        );
      }
      throw err;
    }
  },

  async login(input: LoginInput): Promise<AuthResult> {
    const user = await userService.findByEmail(input.email);

    // Always run bcrypt.compare so response time does not reveal whether the email exists.
    const hash = user?.password ?? (await getDummyHash());
    const passwordOk = await bcrypt.compare(input.password, hash);

    if (!user || !passwordOk) {
      throw AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
    }
    return buildAuthResult(user);
  },
};
