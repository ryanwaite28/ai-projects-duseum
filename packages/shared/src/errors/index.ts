// =============================================================================
// packages/shared/src/errors/index.ts
// AppError hierarchy — Section 6.7
//
// All Lambda errors flow through errorHandlerMiddleware which catches AppError
// subclasses and returns a consistent JSON response shape:
// { "error": { "code": "NOT_FOUND", "message": "...", "requestId": "..." } }
// =============================================================================

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
    this.name = this.constructor.name
    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class NotFoundError extends AppError {
  constructor(msg = 'Not found') { super(404, 'NOT_FOUND', msg) }
}

export class UnauthorizedError extends AppError {
  constructor(msg = 'Unauthorized') { super(401, 'UNAUTHORIZED', msg) }
}

export class ForbiddenError extends AppError {
  constructor(msg = 'Forbidden') { super(403, 'FORBIDDEN', msg) }
}

export class PaymentRequiredError extends AppError {
  constructor(msg: string) { super(402, 'PAYMENT_REQUIRED', msg) }
}

export class ValidationError extends AppError {
  constructor(msg: string) { super(400, 'VALIDATION_ERROR', msg) }
}

export class ConflictError extends AppError {
  constructor(msg: string) { super(409, 'CONFLICT', msg) }
}
