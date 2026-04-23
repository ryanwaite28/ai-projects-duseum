// =============================================================================
// packages/shared/src/middleware/validate-body.ts
// Zod-based request body parser/validator — throws ValidationError on failure.
// =============================================================================

import type { ZodType, z } from 'zod'
import { ValidationError } from '../errors/index.js'

/**
 * Parses and validates a raw JSON string against a Zod schema.
 * Throws `ValidationError` (HTTP 400) when:
 *  - body is absent / null
 *  - body is not valid JSON
 *  - parsed value fails Zod validation
 *
 * @param schema  Zod schema describing the expected shape
 * @param rawBody The raw string body from the Lambda event (may be undefined)
 * @returns       The fully-typed, validated payload
 */
export const validateBody = <T extends ZodType>(
  schema: T,
  rawBody: string | null | undefined
): z.infer<T> => {
  if (rawBody == null || rawBody === '') {
    throw new ValidationError('Request body is required')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    throw new ValidationError('Request body must be valid JSON')
  }

  const result = schema.safeParse(parsed)
  if (!result.success) {
    const messages = result.error.errors
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join('; ')
    throw new ValidationError(`Validation failed: ${messages}`)
  }

  return result.data
}
