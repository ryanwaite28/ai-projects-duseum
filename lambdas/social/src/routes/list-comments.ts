// GET /artworks/{artworkId}/comments — Section 8.7, FR-SOC-02
// Public route — no auth required.

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import {
  NotFoundError,
  docClient,
  getArtPiece,
  listComments,
  ok,
} from '@duseum/shared'

export const listCommentsRoute = async (
  event: APIGatewayProxyEventV2,
  artworkId: string
): Promise<APIGatewayProxyStructuredResultV2> => {
  const qs = event.queryStringParameters ?? {}

  const limitRaw = parseInt(qs['limit'] ?? '20', 10)
  const limit    = isNaN(limitRaw) || limitRaw < 1 ? 20 : Math.min(limitRaw, 50)

  const cursorRaw = qs['cursor']
  const lastKey   = cursorRaw
    ? (JSON.parse(Buffer.from(cursorRaw, 'base64url').toString('utf8')) as Record<string, unknown>)
    : undefined

  const artwork = await getArtPiece(docClient, artworkId)
  if (!artwork) throw new NotFoundError('Artwork not found')

  const { items, lastKey: nextKey } = await listComments(docClient, { artworkId, limit, lastKey })

  const nextCursor = nextKey
    ? Buffer.from(JSON.stringify(nextKey)).toString('base64url')
    : null

  return ok({
    items: items.map(({ PK: _pk, SK: _sk, ...comment }) => comment),
    nextCursor,
  })
}
