// =============================================================================
// packages/shared/src/errors/index.test.ts
// Unit tests for AppError subclass hierarchy — Section 15.2
// =============================================================================

import { describe, it, expect } from 'vitest'
import {
  AppError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  PaymentRequiredError,
  ValidationError,
  ConflictError,
} from './index.js'

describe('AppError', () => {
  it('sets statusCode, code, and message', () => {
    const err = new AppError(418, 'IM_A_TEAPOT', "I'm a teapot")
    expect(err.statusCode).toBe(418)
    expect(err.code).toBe('IM_A_TEAPOT')
    expect(err.message).toBe("I'm a teapot")
  })

  it('is an instance of Error', () => {
    expect(new AppError(500, 'ERR', 'msg')).toBeInstanceOf(Error)
  })
})

describe('NotFoundError', () => {
  it('has statusCode 404 and code NOT_FOUND', () => {
    const err = new NotFoundError()
    expect(err.statusCode).toBe(404)
    expect(err.code).toBe('NOT_FOUND')
    expect(err.message).toBe('Not found')
  })

  it('accepts a custom message', () => {
    const err = new NotFoundError('Art piece not found')
    expect(err.message).toBe('Art piece not found')
  })

  it('is instanceof AppError', () => {
    expect(new NotFoundError()).toBeInstanceOf(AppError)
  })
})

describe('UnauthorizedError', () => {
  it('has statusCode 401 and code UNAUTHORIZED', () => {
    const err = new UnauthorizedError()
    expect(err.statusCode).toBe(401)
    expect(err.code).toBe('UNAUTHORIZED')
  })

  it('is instanceof AppError', () => {
    expect(new UnauthorizedError()).toBeInstanceOf(AppError)
  })
})

describe('ForbiddenError', () => {
  it('has statusCode 403 and code FORBIDDEN', () => {
    const err = new ForbiddenError()
    expect(err.statusCode).toBe(403)
    expect(err.code).toBe('FORBIDDEN')
  })

  it('is instanceof AppError', () => {
    expect(new ForbiddenError()).toBeInstanceOf(AppError)
  })
})

describe('PaymentRequiredError', () => {
  it('has statusCode 402 and code PAYMENT_REQUIRED', () => {
    const err = new PaymentRequiredError('Platform subscription required')
    expect(err.statusCode).toBe(402)
    expect(err.code).toBe('PAYMENT_REQUIRED')
    expect(err.message).toBe('Platform subscription required')
  })

  it('is instanceof AppError', () => {
    expect(new PaymentRequiredError('msg')).toBeInstanceOf(AppError)
  })
})

describe('ValidationError', () => {
  it('has statusCode 400 and code VALIDATION_ERROR', () => {
    const err = new ValidationError('title is required')
    expect(err.statusCode).toBe(400)
    expect(err.code).toBe('VALIDATION_ERROR')
    expect(err.message).toBe('title is required')
  })

  it('is instanceof AppError', () => {
    expect(new ValidationError('msg')).toBeInstanceOf(AppError)
  })
})

describe('ConflictError', () => {
  it('has statusCode 409 and code CONFLICT', () => {
    const err = new ConflictError('Author already has a booking this week')
    expect(err.statusCode).toBe(409)
    expect(err.code).toBe('CONFLICT')
  })

  it('is instanceof AppError', () => {
    expect(new ConflictError('msg')).toBeInstanceOf(AppError)
  })
})
