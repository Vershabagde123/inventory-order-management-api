import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { isProduction } from '../config/env.js';
import { Prisma } from '../generated/prisma/client.js';
import { AppError, type ErrorDetail } from '../utils/AppError.js';

interface ErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: ErrorDetail[];
    stack?: string;
  };
}

function zodToDetails(err: ZodError): ErrorDetail[] {
  return err.issues.map((issue) => ({
    field: issue.path.join('.') || undefined,
    message: issue.message,
  }));
}

/**
 * Map known Prisma errors to HTTP errors. Services already translate the
 * expected cases (e.g. duplicate SKU); this is the generic fallback.
 * Messages are generic on purpose - Prisma's own messages can include query details.
 */
function mapPrismaError(err: unknown): AppError | null {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': // unique constraint
        return AppError.conflict('A record with the same unique value already exists', 'DUPLICATE');
      case 'P2003': // foreign key constraint
        return AppError.conflict(
          'Operation violates a relation constraint',
          'FOREIGN_KEY_CONSTRAINT',
        );
      case 'P2025': // record not found
        return AppError.notFound('Resource not found');
      case 'P2034': // write conflict / deadlock - safe for the client to retry
        return AppError.conflict(
          'The request conflicted with a concurrent update, please retry',
          'TRANSACTION_CONFLICT',
        );
      case 'P2028': // interactive transaction API error (e.g. timeout)
        return new AppError(
          503,
          'TRANSACTION_UNAVAILABLE',
          'The database is busy, please retry shortly',
        );
      default:
        break;
    }
    // CHECK constraint violations (e.g. stock >= 0) surface as raw DB errors.
    if (/check constraint/i.test(err.message)) {
      return AppError.conflict('Operation violates a data integrity rule', 'CONSTRAINT_VIOLATION');
    }
    return null;
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    return AppError.badRequest('Invalid data for database operation');
  }

  if (err instanceof Prisma.PrismaClientInitializationError) {
    return new AppError(503, 'DATABASE_UNAVAILABLE', 'Database is unavailable');
  }

  return null;
}

/** Translate any thrown value into an AppError (or null if it is unexpected). */
export function toAppError(err: unknown): AppError | null {
  if (err instanceof AppError) return err;

  if (err instanceof ZodError) {
    return AppError.badRequest('Validation failed', zodToDetails(err), 'VALIDATION_ERROR');
  }

  const prismaError = mapPrismaError(err);
  if (prismaError) return prismaError;

  // Malformed JSON body (thrown by express.json / body-parser)
  if (
    err instanceof SyntaxError &&
    typeof (err as { status?: unknown }).status === 'number' &&
    'body' in err
  ) {
    return AppError.badRequest('Malformed JSON in request body', undefined, 'INVALID_JSON');
  }

  // Body too large etc. from body-parser
  const status = (err as { status?: unknown; expose?: unknown })?.status;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    const message = (err as Error).message || 'Bad request';
    return new AppError(status, 'BAD_REQUEST', message);
  }

  return null;
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(AppError.notFound(`Route ${req.method} ${req.path} not found`));
};

/**
 * Central error handler. Express 5 forwards rejected promises from async
 * handlers here automatically, so controllers need no try/catch wrappers.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const appError = toAppError(err);

  if (appError) {
    const body: ErrorBody = {
      success: false,
      error: { code: appError.code, message: appError.message },
    };
    if (appError.details?.length) body.error.details = appError.details;
    res.status(appError.statusCode).json(body);
    return;
  }

  // Unexpected error: log server-side, never leak internals to the client in production.
  console.error('[error] unhandled:', err);
  const body: ErrorBody = {
    success: false,
    error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' },
  };
  if (!isProduction && err instanceof Error && err.stack) {
    body.error.stack = err.stack;
  }
  res.status(500).json(body);
};
