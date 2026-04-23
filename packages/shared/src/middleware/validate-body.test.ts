// =============================================================================
// packages/shared/src/middleware/validate-body.test.ts
// Unit tests for validateBody — Section 15.2
// =============================================================================

import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { validateBody } from './validate-body.js'
import { ValidationError } from '../errors/index.js'

const TestSchema = z.object({
  title: z.string().min(1),
  count: z.number().int().positive(),
})

describe('validateBody', () => {
  it('returns typed object for valid JSON matching schema', () => {
    const result = validateBody(
      TestSchema,
      JSON.stringify({ title: 'Sunset', count: 3 })
    )
    expect(result).toEqual({ title: 'Sunset', count: 3 })
  })

  it('throws ValidationError when body is null', () => {
    expect(() => validateBody(TestSchema, null)).toThrow(ValidationError)
    expect(() => validateBody(TestSchema, null)).toThrow('required')
  })

  it('throws ValidationError when body is undefined', () => {
    expect(() => validateBody(TestSchema, undefined)).toThrow(ValidationError)
  })

  it('throws ValidationError when body is empty string', () => {
    expect(() => validateBody(TestSchema, '')).toThrow(ValidationError)
  })

  it('throws ValidationError for non-JSON string', () => {
    expect(() => validateBody(TestSchema, 'not json')).toThrow(ValidationError)
    expect(() => validateBody(TestSchema, 'not json')).toThrow('valid JSON')
  })

  it('throws ValidationError when required field is missing', () => {
    expect(() =>
      validateBody(TestSchema, JSON.stringify({ title: 'Hello' }))
    ).toThrow(ValidationError)
  })

  it('throws ValidationError when field type is wrong', () => {
    expect(() =>
      validateBody(TestSchema, JSON.stringify({ title: 'Hello', count: 'two' }))
    ).toThrow(ValidationError)
  })

  it('error message includes field path and Zod message', () => {
    let message = ''
    try {
      validateBody(TestSchema, JSON.stringify({ title: '', count: 3 }))
    } catch (e) {
      if (e instanceof ValidationError) message = e.message
    }
    expect(message).toContain('title')
  })

  it('strips extra fields not in schema (Zod default behaviour)', () => {
    const result = validateBody(
      TestSchema,
      JSON.stringify({ title: 'Art', count: 1, extra: 'ignored' })
    )
    expect((result as Record<string, unknown>).extra).toBeUndefined()
  })

  it('throws ValidationError (HTTP 400) not a generic Error', () => {
    try {
      validateBody(TestSchema, null)
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError)
      expect((e as ValidationError).statusCode).toBe(400)
    }
  })
})
