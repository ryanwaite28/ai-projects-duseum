// =============================================================================
// lambdas/features/src/routes/get-weekly.ts
// GET /features/weekly — Section 8.9, FR-FEAT-08/16
//
// Public route. Returns this week's (or specified week's) ACTIVE featured Authors.
// Order is randomized each response to avoid positional advantage (FR-FEAT-16).
// =============================================================================

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  ValidationError,
  docClient,
  getAuthorProfile,
  getAuthorPublicGallery,
  getConfigNumber,
  getCurrentIsoWeek,
  getWeekBounds,
  listBookingsByStatusAndWeek,
  ok,
  publicUrl,
} from '@duseum/shared'

const ISO_WEEK_RE = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/

/** Fisher-Yates in-place shuffle */
const shuffle = <T>(arr: T[]): T[] => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export const getWeeklyFeature = async (
  event: APIGatewayProxyEventV2,
  _context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2> => {
  const rawWeek = event.queryStringParameters?.['week']
  const isoWeek = rawWeek ?? getCurrentIsoWeek()

  if (rawWeek && !ISO_WEEK_RE.test(rawWeek)) {
    throw new ValidationError('Invalid week format. Expected YYYY-Www (e.g. 2025-W32).')
  }

  const { weekStartDate, weekEndDate } = getWeekBounds(isoWeek)

  const [bookings, slotCount] = await Promise.all([
    listBookingsByStatusAndWeek(docClient, 'ACTIVE', isoWeek),
    getConfigNumber(docClient, 'WEEKLY_FEATURE_SLOT_COUNT', 10),
  ])

  // Randomize order per response (FR-FEAT-16)
  shuffle(bookings)

  const featuredAuthors = await Promise.all(
    bookings.map(async (booking) => {
      const [author, galleryResult] = await Promise.all([
        getAuthorProfile(docClient, booking.authorId),
        getAuthorPublicGallery(docClient, booking.authorId, 2),
      ])
      if (!author) return null
      return {
        authorId:       author.userId,
        displayName:    author.displayName,
        coverPhotoUrl:  author.coverPhotoS3Key ? publicUrl(author.coverPhotoS3Key) : null,
        recentPieces:   galleryResult.items.map((p) => ({
          artworkId:    p.artworkId,
          title:        p.title,
          thumbnailUrl: p.s3Key ? publicUrl(p.s3Key) : null,
        })),
      }
    })
  )

  return ok({
    isoWeek,
    weekStartDate,
    weekEndDate,
    slotsFilled:    bookings.length,
    slotsTotal:     slotCount,
    featuredAuthors: featuredAuthors.filter(Boolean),
  })
}
