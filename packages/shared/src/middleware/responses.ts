// =============================================================================
// packages/shared/src/middleware/responses.ts
// Convenience helpers for well-shaped API GW v2 responses.
// =============================================================================

import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda'

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const

/**
 * 200 OK with a JSON body.
 */
export const ok = (body: unknown): APIGatewayProxyStructuredResultV2 => ({
  statusCode: 200,
  headers: JSON_HEADERS,
  body: JSON.stringify(body),
})

/**
 * 201 Created with a JSON body.
 */
export const created = (body: unknown): APIGatewayProxyStructuredResultV2 => ({
  statusCode: 201,
  headers: JSON_HEADERS,
  body: JSON.stringify(body),
})

/**
 * 204 No Content — no body.
 */
export const noContent = (): APIGatewayProxyStructuredResultV2 => ({
  statusCode: 204,
})
