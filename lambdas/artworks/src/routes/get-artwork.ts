// =============================================================================
// lambdas/artworks/src/routes/get-artwork.ts
// GET /artworks/{artworkId} — Section 4.4, 8.2
//
// JWT is optional. Applies full checkArtPieceAccess() logic:
//   - PUBLIC pieces: enforce free-tier limit; return plain CloudFront URL
//   - PRIVATE pieces: Author subscribers get a 1-hour signed URL
//   - DRAFT pieces: Author sees their own draft; everyone else gets 403
//   - ARCHIVED pieces: treated as 404
// viewCount increment is fire-and-forget and does NOT block the response.
// =============================================================================

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  ForbiddenError,
  NotFoundError,
  PaymentRequiredError,
  checkArtPieceAccess,
  countPublicPiecesByAuthorUpTo,
  docClient,
  generateSignedUrl,
  getArtPiece,
  getAuthorProfile,
  getAuthorSubscription,
  getFreeTierLimit,
  getPlatformSubscription,
  getUserReaction,
  incrementViewCount,
  ok,
  publicUrl,
} from '@duseum/shared'

const SIGNED_URL_TTL = 3600 // 1 hour

export const getArtwork = async (
  event: APIGatewayProxyEventV2,
  context: DuseumContext,
  artworkId: string
): Promise<APIGatewayProxyStructuredResultV2> => {
  const piece = await getArtPiece(docClient, artworkId)
  if (!piece || piece.status === 'ARCHIVED') throw new NotFoundError('Art piece not found')

  const userId: string | undefined = context.userId

  const isAuthor = !!userId && piece.authorId === userId

  // Short-circuit: author always has access — skip subscription lookups
  let isPlatformSubscriber = false
  let isAuthorSubscriber   = false

  if (!isAuthor && userId) {
    const [platformSub, authorSub] = await Promise.all([
      getPlatformSubscription(docClient, userId),
      getAuthorSubscription(docClient, userId, piece.authorId),
    ])
    isPlatformSubscriber = platformSub?.status === 'ACTIVE'
    isAuthorSubscriber   = authorSub?.status === 'ACTIVE'
  }

  const [freeTierLimit, authorPieceIndex] = await Promise.all([
    getFreeTierLimit(docClient),
    countPublicPiecesByAuthorUpTo(docClient, piece.authorId, piece.createdAt),
  ])

  const decision = checkArtPieceAccess(
    piece,
    {
      viewerId:            userId ?? '',
      isAuthor,
      isPlatformSubscriber,
      isAuthorSubscriber,
    },
    freeTierLimit,
    authorPieceIndex
  )

  if (!decision.allowed) {
    if (decision.reason === 'FORBIDDEN') throw new ForbiddenError()
    if (decision.reason === 'REQUIRES_AUTHOR_SUB') {
      throw new PaymentRequiredError(
        'This piece is in the author\'s private section.'
      )
    }
    // REQUIRES_PLATFORM_SUB
    throw new PaymentRequiredError('A platform subscription is required to view this piece.')
  }

  // Increment view count — fire-and-forget, never blocks response
  void incrementViewCount(docClient, artworkId).catch(() => {/* swallow — non-critical */})

  const [imageResolved, viewerReactionRecord, authorProfile] = await Promise.all([
    decision.signUrl
      ? generateSignedUrl(piece.s3Key, SIGNED_URL_TTL).then(url => ({
          imageUrl:          url,
          imageUrlExpiresAt: new Date(Date.now() + SIGNED_URL_TTL * 1000).toISOString(),
        }))
      : Promise.resolve({ imageUrl: publicUrl(piece.s3Key), imageUrlExpiresAt: undefined }),
    userId ? getUserReaction(docClient, artworkId, userId) : Promise.resolve(null),
    getAuthorProfile(docClient, piece.authorId),
  ])

  return ok({
    ...piece,
    imageUrl:           imageResolved.imageUrl,
    ...(imageResolved.imageUrlExpiresAt ? { imageUrlExpiresAt: imageResolved.imageUrlExpiresAt } : {}),
    viewerReaction:     viewerReactionRecord?.reactionType ?? null,
    authorDisplayName:  authorProfile?.displayName ?? '',
  })
}
