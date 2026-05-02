// GET /features/homepage — FR-DISC-01, §8.9
// Public, no auth required. Composes daily featured, weekly featured, and recent pieces.
// Daily featured returns null if maintenance-lambda has not yet run for today.

import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import {
  docClient,
  getAuthorProfile,
  getAuthorPublicGallery,
  getDailyFeaturedAuthor,
  getCurrentIsoWeek,
  listBookingsByStatusAndWeek,
  listPublicArtPieces,
  ok,
  publicUrl,
} from '@duseum/shared'

/** Fisher-Yates in-place shuffle */
const shuffle = <T>(arr: T[]): T[] => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
  return arr
}

export const getHomepage = async (): Promise<APIGatewayProxyStructuredResultV2> => {
  const isoWeek = getCurrentIsoWeek()

  const [dailyConfig, weeklyBookings, recentResult] = await Promise.all([
    getDailyFeaturedAuthor(docClient),
    listBookingsByStatusAndWeek(docClient, 'ACTIVE', isoWeek),
    listPublicArtPieces(docClient, { limit: 12 }),
  ])

  // ── Daily featured ─────────────────────────────────────────────────────────

  let dailyFeatured = null
  if (dailyConfig) {
    const [author, gallery] = await Promise.all([
      getAuthorProfile(docClient, dailyConfig.authorId),
      getAuthorPublicGallery(docClient, dailyConfig.authorId, 3),
    ])
    if (author && author.status === 'ACTIVE') {
      dailyFeatured = {
        authorId:      author.userId,
        displayName:   author.displayName,
        bio:           author.bio,
        coverPhotoUrl: author.coverPhotoS3Key ? publicUrl(author.coverPhotoS3Key) : null,
        followerCount: author.followerCount,
        spotlightPieces: gallery.items.map((p) => ({
          artworkId:    p.artworkId,
          title:        p.title,
          thumbnailUrl: p.s3Key ? publicUrl(p.s3Key) : null,
          category:     p.category,
        })),
        selectionMethod: dailyConfig.selectionMethod,
      }
    }
  }

  // ── Weekly featured (randomized order per request) ─────────────────────────

  shuffle(weeklyBookings)

  const weeklyFeatured = (
    await Promise.all(
      weeklyBookings.map(async (booking) => {
        const [author, gallery] = await Promise.all([
          getAuthorProfile(docClient, booking.authorId),
          getAuthorPublicGallery(docClient, booking.authorId, 2),
        ])
        if (!author || author.status !== 'ACTIVE') return null
        return {
          authorId:      author.userId,
          displayName:   author.displayName,
          coverPhotoUrl: author.coverPhotoS3Key ? publicUrl(author.coverPhotoS3Key) : null,
          recentPieces:  gallery.items.map((p) => ({
            artworkId:    p.artworkId,
            title:        p.title,
            thumbnailUrl: p.s3Key ? publicUrl(p.s3Key) : null,
          })),
        }
      })
    )
  ).filter(Boolean)

  // ── Recent pieces ──────────────────────────────────────────────────────────

  const recentPieces = recentResult.items.map((p) => ({
    artworkId:    p.artworkId,
    title:        p.title,
    authorId:     p.authorId,
    category:     p.category,
    thumbnailUrl: p.s3Key ? publicUrl(p.s3Key) : null,
    viewCount:    p.viewCount,
    publishedAt:  p.publishedAt,
  }))

  return ok({
    dailyFeatured,
    weeklyFeatured,
    recentPieces,
    isoWeek,
  })
}
