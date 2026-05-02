// =============================================================================
// lambdas/artworks/src/routes/list-my-artworks.ts
// GET /artworks/mine — FR-ART-11
// JWT required. Returns all pieces owned by the caller (PUBLIC, PRIVATE, DRAFT).
// PRIVATE pieces include a signed CloudFront URL.
// =============================================================================

import { z } from 'zod'
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  ForbiddenError,
  ValidationError,
  docClient,
  generateSignedUrl,
  getAuthorProfile,
  listOwnArtPieces,
  ok,
  publicUrl,
} from '@duseum/shared'

const SIGNED_URL_TTL = 3_600 // 1 hour

const VisibilitySchema = z.enum(['PUBLIC', 'PRIVATE', 'DRAFT']).optional()

export const listMyArtworks = async (
  event: APIGatewayProxyEventV2,
  context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2> => {
  const { userId } = context

  const authorProfile = await getAuthorProfile(docClient, userId)
  if (!authorProfile || authorProfile.status !== 'ACTIVE') {
    throw new ForbiddenError('An active Author profile is required')
  }

  const q = event.queryStringParameters ?? {}

  const limitRaw = q['limit'] ? parseInt(q['limit'], 10) : 20
  if (isNaN(limitRaw) || limitRaw < 1) throw new ValidationError('limit must be a positive integer')
  const limit = Math.min(limitRaw, 50)

  const visibilityParse = VisibilitySchema.safeParse(q['visibility'])
  if (!visibilityParse.success) {
    throw new ValidationError('visibility must be PUBLIC, PRIVATE, or DRAFT')
  }
  const visibilityFilter = visibilityParse.data

  let lastKey: Record<string, unknown> | undefined
  if (q['cursor']) {
    try {
      lastKey = JSON.parse(Buffer.from(q['cursor'], 'base64url').toString('utf8'))
    } catch {
      throw new ValidationError('Invalid cursor')
    }
  }

  const result = await listOwnArtPieces(docClient, {
    authorId: userId,
    visibilityFilter,
    limit,
    lastKey,
  })

  // Attach URLs — signed for PRIVATE, plain for PUBLIC/DRAFT
  const items = await Promise.all(
    result.items.map(async (piece) => {
      if (piece.visibility === 'PRIVATE') {
        const imageUrl          = await generateSignedUrl(piece.s3Key, SIGNED_URL_TTL)
        const imageUrlExpiresAt = new Date(Date.now() + SIGNED_URL_TTL * 1000).toISOString()
        return { ...piece, imageUrl, imageUrlExpiresAt }
      }
      return { ...piece, imageUrl: publicUrl(piece.s3Key) }
    })
  )

  const nextCursor = result.lastKey
    ? Buffer.from(JSON.stringify(result.lastKey)).toString('base64url')
    : undefined

  return ok({ items, ...(nextCursor ? { nextCursor } : {}) })
}

void ValidationError
