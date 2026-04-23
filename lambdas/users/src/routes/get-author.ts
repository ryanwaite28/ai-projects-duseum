// =============================================================================
// lambdas/users/src/routes/get-author.ts
// GET /authors/{authorId} — Author public profile + paginated gallery (§8.5)
// =============================================================================

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import {
  NotFoundError,
  ValidationError,
  docClient,
  getAuthorProfile,
  getAuthorPublicGallery,
  ok,
  publicUrl,
} from '@duseum/shared'

export const getAuthor = async (
  event: APIGatewayProxyEventV2,
  authorId: string
): Promise<APIGatewayProxyStructuredResultV2> => {
  const author = await getAuthorProfile(docClient, authorId)
  if (!author || author.status !== 'ACTIVE') throw new NotFoundError('Author not found')

  const qs = event.queryStringParameters ?? {}
  const limitRaw = parseInt(qs['limit'] ?? '12', 10)
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

  const gallery = await getAuthorPublicGallery(docClient, authorId, limitRaw, lastKey)

  const nextCursor = gallery.lastKey
    ? Buffer.from(JSON.stringify(gallery.lastKey)).toString('base64url')
    : undefined

  return ok({
    profile: {
      authorId:          author.userId,
      displayName:       author.displayName,
      bio:               author.bio,
      profilePhotoUrl:   author.profilePhotoS3Key ? publicUrl(author.profilePhotoS3Key) : null,
      coverPhotoUrl:     author.coverPhotoS3Key   ? publicUrl(author.coverPhotoS3Key)   : null,
      followerCount:     author.followerCount,
      subscriberCount:   author.subscriberCount,
      totalPiecesCount:  author.totalPiecesCount,
      authorSubscriptionMonthlyUsd: author.authorSubscriptionMonthlyUsd,
      createdAt:         author.createdAt,
    },
    gallery: {
      items: gallery.items.map((p) => ({
        artworkId:    p.artworkId,
        title:        p.title,
        category:     p.category,
        tags:         p.tags,
        thumbnailUrl: publicUrl(p.s3Key),
        viewCount:    p.viewCount,
        publishedAt:  p.publishedAt,
      })),
      nextCursor,
    },
  })
}
