// =============================================================================
// lambdas/features/src/routes/get-weekly-availability.ts
// GET /features/weekly/availability — Section 8.9, FR-FEAT-10/14
//
// Public route. Returns the next advanceWeeks booking slots with per-week
// available slot counts. Only CONFIRMED bookings count against capacity
// (PENDING_PAYMENT bookings do not reserve slots — FR-FEAT-12).
// =============================================================================

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  countActiveBookingsForWeek,
  docClient,
  getEligibleWeeks,
  getWeekBounds,
  getWeeklyFeatureConfig,
  ok,
} from '@duseum/shared'

export const getWeeklyAvailability = async (
  _event: APIGatewayProxyEventV2,
  _context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2> => {
  const { feeUsd, slotCount, advanceWeeks } = await getWeeklyFeatureConfig(docClient)

  const eligibleWeeks = getEligibleWeeks(advanceWeeks)

  // Count confirmed bookings for each eligible week in parallel
  const counts = await Promise.all(
    eligibleWeeks.map((week) => countActiveBookingsForWeek(docClient, week))
  )

  const weeks = eligibleWeeks.map((isoWeek, i) => {
    const confirmedCount = counts[i]
    const slotsAvailable = Math.max(0, slotCount - confirmedCount)
    const { weekStartDate, weekEndDate } = getWeekBounds(isoWeek)
    return {
      isoWeek,
      weekStartDate,
      weekEndDate,
      slotsTotal:     slotCount,
      slotsAvailable,
      isAvailable:    slotsAvailable > 0,
    }
  })

  return ok({ weeks, feeFeeUsd: feeUsd })
}
