// =============================================================================
// lambdas/features/src/routes/get-daily.ts
// GET /features/daily — Section 8.9, FR-FEAT-02/07
//
// Public route. Returns today's DAILY_FEATURED_AUTHOR from the config table,
// along with the AuthorProfile and up to 3 pinned (or most recent) public pieces.
// Returns 404 if maintenance-lambda has not yet written today's selection.
// =============================================================================

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  NotFoundError,
  docClient,
  getAuthorProfile,
  getAuthorPublicGallery,
  getDailyFeaturedAuthor,
  ok,
  publicUrl,
} from '@duseum/shared'

export const getDailyFeature = async (
  _event: APIGatewayProxyEventV2,
  _context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2> => {
  const config = await getDailyFeaturedAuthor(docClient)
  if (!config) throw new NotFoundError('No Daily Featured Author has been selected yet.')

  const [author, galleryResult] = await Promise.all([
    getAuthorProfile(docClient, config.authorId),
    getAuthorPublicGallery(docClient, config.authorId, 3),
  ])

  if (!author || author.status !== 'ACTIVE') {
    throw new NotFoundError('Featured author is no longer active.')
  }

  const today = new Date().toISOString().split('T')[0]

  const spotlightPieces = galleryResult.items.map((p) => ({
    artworkId:    p.artworkId,
    title:        p.title,
    thumbnailUrl: p.s3Key ? publicUrl(p.s3Key) : null,
    category:     p.category,
  }))

  return ok({
    date: today,
    author: {
      authorId:                        author.userId,
      displayName:                     author.displayName,
      bio:                             author.bio,
      coverPhotoUrl:                   author.coverPhotoS3Key ? publicUrl(author.coverPhotoS3Key) : null,
      followerCount:                   author.followerCount,
      subscriberCount:                 author.subscriberCount,
      authorSubscriptionMonthlyUsd:    author.authorSubscriptionMonthlyUsd,
    },
    spotlightPieces,
    selectionMethod: config.selectionMethod,
  })
}
