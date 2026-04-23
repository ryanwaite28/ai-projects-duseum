// =============================================================================
// lambdas/users/src/routes/list-authors.ts
// GET /authors — paginated Author directory (§8.5, FR-DISC-04)
//
// Query params:
//   sort   = 'newest' | 'subscriberCount'  (default: newest)
//   limit  = 1–50                           (default: 20)
//   cursor = base64url-encoded lastKey
// =============================================================================

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import {
  ValidationError,
  docClient,
  listAuthors as listAuthorsRepo,
  ok,
} from '@duseum/shared'

export const listAuthors = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  const qs = event.queryStringParameters ?? {}

  const sortRaw = qs['sort'] ?? 'newest'
  if (sortRaw !== 'newest' && sortRaw !== 'subscriberCount') {
    throw new ValidationError('sort must be "newest" or "subscriberCount"')
  }

  const limitRaw = parseInt(qs['limit'] ?? '20', 10)
  if (isNaN(limitRaw) || limitRaw < 1 || limitRaw > 50) {
    throw new ValidationError('limit must be between 1 and 50')
  }

  let lastKey: Record<string, unknown> | undefined
  if (qs['cursor']) {
    try {
      lastKey = JSON.parse(Buffer.from(qs['cursor'], 'base64url').toString('utf8'))
    } catch {
      throw new ValidationError('Invalid cursor')
    }
  }

  const result = await listAuthorsRepo(docClient, {
    sort: sortRaw,
    limit: limitRaw,
    lastKey,
  })

  const nextCursor = result.lastKey
    ? Buffer.from(JSON.stringify(result.lastKey)).toString('base64url')
    : undefined

  return ok({ items: result.items, nextCursor })
}
