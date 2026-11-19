export interface ErrorDetail {
  field?: string;
  message: string;
  [key: string]: unknown;
}

/**
 * Operational error with an HTTP status and a stable machine-readable code.
 * Anything thrown that is NOT an AppError (or a mapped Zod/Prisma/JSON error)
 * is treated as an unexpected 500 and its message is never sent to clients.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: ErrorDetail[];

  constructor(statusCode: number, code: string, message: string, details?: ErrorDetail[]) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    if (details) this.details = details;
  }

  static badRequest(message: string, details?: ErrorDetail[], code = 'BAD_REQUEST') {
    return new AppError(400, code, message, details);
  }

  static unauthorized(message = 'Authentication required', code = 'UNAUTHORIZED') {
    return new AppError(401, code, message);
  }

  static forbidden(message = 'You do not have permission to perform this action') {
    return new AppError(403, 'FORBIDDEN', message);
  }

  static notFound(message = 'Resource not found', details?: ErrorDetail[]) {
    return new AppError(404, 'NOT_FOUND', message, details);
  }

  static conflict(message: string, code = 'CONFLICT', details?: ErrorDetail[]) {
    return new AppError(409, code, message, details);
  }
}
