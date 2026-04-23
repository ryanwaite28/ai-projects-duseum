// =============================================================================
// lambdas/features/src/routes/get-my-bookings.ts
// GET /features/weekly/my-bookings — Section 8.9, FR-FEAT-18
//
// Author only. Returns the calling Author's full booking history (upcoming and
// past) plus nextEligibleWeek based on the 3-month rolling window.
// =============================================================================

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  ForbiddenError,
  addWeeks,
  docClient,
  getAuthorProfile,
  getCurrentIsoWeek,
  getRecentBookingsByAuthor,
  isWithinThreeMonthWindow,
  ok,
} from '@duseum/shared'

export const getMyBookings = async (
  _event: APIGatewayProxyEventV2,
  context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2> => {
  const { userId } = context

  const authorProfile = await getAuthorProfile(docClient, userId)
  if (!authorProfile || authorProfile.status !== 'ACTIVE') {
    throw new ForbiddenError('An active Author profile is required.')
  }

  const bookings = await getRecentBookingsByAuthor(docClient, userId, 50)

  // nextEligibleWeek: find the most recent CONFIRMED/ACTIVE booking within the
  // 3-month window; eligible again at booking.isoWeek + 13 weeks.
  const disqualifying = bookings.find(
    (b) =>
      (b.featureStatus === 'CONFIRMED' || b.featureStatus === 'ACTIVE') &&
      isWithinThreeMonthWindow(b.isoWeek, new Date())
  )

  const nextEligibleWeek = disqualifying
    ? addWeeks(disqualifying.isoWeek, 13)
    : addWeeks(getCurrentIsoWeek(), 1)

  const items = bookings.map((b) => ({
    bookingId:     b.bookingId,
    isoWeek:       b.isoWeek,
    weekStartDate: b.weekStartDate,
    weekEndDate:   b.weekEndDate,
    featureStatus: b.featureStatus,
    amountPaidUsd: b.amountPaidUsd,
    bookedAt:      b.bookedAt,
  }))

  return ok({ items, nextEligibleWeek })
}
