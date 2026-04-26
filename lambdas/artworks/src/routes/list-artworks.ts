// =============================================================================
// lambdas/artworks/src/routes/list-artworks.ts
// GET /artworks — Section 8.2, 6.5, 1.4
//
// JWT is optional (public route). Each item in the response is annotated:
//   - accessible piece: { ...piece, thumbnailUrl, accessTier: 'PUBLIC' }
//   - locked piece:     { artworkId, authorId, title, category, createdAt,
//                         accessTier: 'REQUIRES_PLATFORM_SUB' }
//
// A piece is accessible if any of the following hold:
//   a) authorPieceIndex (1-based rank in Author's public timeline) ≤ freeTierLimit
//   b) caller is an active Platform Subscriber
//   c) caller is an active Author Subscriber to THIS piece's author
//
// freeTierLimit is loaded once and cached for the Lambda container lifetime.
// Per-author piece ranks are resolved in parallel (Promise.all, ≤ 50 items).
// =============================================================================

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import type { ArtCategory, ArtPiece } from '@duseum/shared'
import {
  ValidationError,
  countPublicPiecesByAuthorUpTo,
  docClient,
  getAuthorSubscription,
  getFreeTierLimit,
  getPlatformSubscription,
  listPublicArtPieces,
  ok,
  publicUrl,
} from '@duseum/shared'

const VALID_CATEGORIES = new Set<string>([
  'PAINTING', 'DIGITAL', 'PHOTOGRAPHY', 'SCULPTURE',
  'ILLUSTRATION', 'MIXED_MEDIA', 'OTHER',
])

const MAX_LIMIT     = 50
const DEFAULT_LIMIT = 20

// Fields stripped from locked items so thumbnails and full metadata are withheld.
const LOCKED_FIELDS_TO_KEEP = new Set(['artworkId', 'authorId', 'title', 'category', 'createdAt'])

type AnnotatedItem = ArtPiece & {
  thumbnailUrl?: string
  accessTier: 'PUBLIC' | 'REQUIRES_PLATFORM_SUB'
}

export const listArtworks = async (
  event: APIGatewayProxyEventV2,
  context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2> => {
  const q = event.queryStringParameters ?? {}

  const limitRaw = q['limit'] ? parseInt(q['limit'], 10) : DEFAULT_LIMIT
  if (isNaN(limitRaw) || limitRaw < 1) throw new ValidationError('limit must be a positive integer')
  const limit = Math.min(limitRaw, MAX_LIMIT)

  const category = q['category']
  if (category && !VALID_CATEGORIES.has(category)) {
    throw new ValidationError(`Invalid category. Must be one of: ${[...VALID_CATEGORIES].join(', ')}`)
  }

  const authorId = q['authorId']
  const tag      = q['tag']

  let lastKey: Record<string, unknown> | undefined
  if (q['cursor']) {
    try {
      lastKey = JSON.parse(Buffer.from(q['cursor'], 'base64url').toString('utf8'))
    } catch {
      throw new ValidationError('Invalid cursor')
    }
  }

  // ── Resolve caller access context ─────────────────────────────────────────

  const userId = context.userId

  // All three lookups can be fired concurrently with the item query.
  const [result, freeTierLimit, platformSub, authorSub] = await Promise.all([
    listPublicArtPieces(docClient, {
      authorId,
      tag,
      category: category as ArtCategory | undefined,
      limit,
      lastKey,
    }),
    getFreeTierLimit(docClient),
    userId ? getPlatformSubscription(docClient, userId) : Promise.resolve(null),
    // Only load Author subscription when the query is scoped to a single author
    userId && authorId
      ? getAuthorSubscription(docClient, userId, authorId)
      : Promise.resolve(null),
  ])

  const isPlatformSubscriber = platformSub?.status === 'ACTIVE'

  // For multi-author feeds, track per-author sub status in a lazy cache keyed by authorId.
  // We always know the single-author case from above; for mixed feeds we check on demand.
  const authorSubCache = new Map<string, boolean>()
  if (authorId && authorSub) {
    authorSubCache.set(authorId, authorSub.status === 'ACTIVE')
  }

  // ── Resolve per-piece ranks in parallel ──────────────────────────────────

  const ranks = await Promise.all(
    result.items.map((piece) =>
      countPublicPiecesByAuthorUpTo(docClient, piece.authorId, piece.createdAt)
    )
  )

  // ── Annotate items ────────────────────────────────────────────────────────

  const annotated = await Promise.all(
    result.items.map(async (piece, i): Promise<AnnotatedItem> => {
      const rank = ranks[i]!

      // Resolve author-sub for pieces where the author differs from the query filter
      // (only relevant in global/tag feeds mixing multiple authors).
      if (!authorSubCache.has(piece.authorId) && userId) {
        const sub = await getAuthorSubscription(docClient, userId, piece.authorId)
        authorSubCache.set(piece.authorId, sub?.status === 'ACTIVE')
      }
      const isAuthorSubscriber = authorSubCache.get(piece.authorId) ?? false

      const accessible =
        rank <= freeTierLimit ||
        isPlatformSubscriber ||
        isAuthorSubscriber

      if (accessible) {
        return {
          ...piece,
          thumbnailUrl: publicUrl(piece.s3Key),
          accessTier:   'PUBLIC',
        }
      }

      // Locked item — return only safe fields (no s3Key, no thumbnailUrl)
      return {
        artworkId:       piece.artworkId,
        authorId:        piece.authorId,
        title:           piece.title,
        category:        piece.category,
        createdAt:       piece.createdAt,
        updatedAt:       piece.updatedAt,
        publishedAt:     piece.publishedAt,
        visibility:      piece.visibility,
        status:          piece.status,
        viewCount:       piece.viewCount,
        accessTier:      'REQUIRES_PLATFORM_SUB',
      } as unknown as AnnotatedItem
    })
  )

  const nextCursor = result.lastKey
    ? Buffer.from(JSON.stringify(result.lastKey)).toString('base64url')
    : undefined

  return ok({
    items:        annotated,
    nextCursor,
    totalVisible: annotated.length,
  })
}
