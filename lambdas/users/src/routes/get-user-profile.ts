// =============================================================================
// lambdas/users/src/routes/get-user-profile.ts
// GET /users/{userId}/profile — public Author profile page (§8.4, FR-AUTH-PROF-07)
// =============================================================================

import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import {
  NotFoundError,
  docClient,
  getAuthorProfile,
  getAuthorPublicGallery,
  ok,
  publicUrl,
} from '@duseum/shared'

export const getUserProfile = async (
  userId: string
): Promise<APIGatewayProxyStructuredResultV2> => {
  const author = await getAuthorProfile(docClient, userId)
  if (!author || author.status !== 'ACTIVE') throw new NotFoundError('Author profile not found')

  const gallery = await getAuthorPublicGallery(docClient, userId, 6)

  return ok({
    authorId:          author.userId,
    displayName:       author.displayName,
    bio:               author.bio,
    profilePhotoUrl:   author.profilePhotoS3Key ? publicUrl(author.profilePhotoS3Key) : null,
    coverPhotoUrl:     author.coverPhotoS3Key   ? publicUrl(author.coverPhotoS3Key)   : null,
    followerCount:     author.followerCount,
    subscriberCount:   author.subscriberCount,
    totalPiecesCount:  author.totalPiecesCount,
    galleryPreview:    gallery.items.map((p) => ({
      artworkId:  p.artworkId,
      title:      p.title,
      category:   p.category,
      thumbnailUrl: publicUrl(p.s3Key),
      publishedAt: p.publishedAt,
    })),
  })
}
