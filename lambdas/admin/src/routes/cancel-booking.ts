// =============================================================================
// lambdas/admin/src/routes/cancel-booking.ts
// DELETE /admin/features/weekly/bookings/{bookingId} — FR-ADMIN-07
//
// Admin cancels a CONFIRMED or ACTIVE weekly feature booking and issues a
// full Stripe refund. The freed slot becomes available immediately (slot count
// is derived live from CONFIRMED bookings via countActiveBookingsForWeek).
// =============================================================================

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  docClient,
  getBookingByBookingId,
  issueRefund,
  ok,
  updateBookingStatus,
} from '@duseum/shared'
import type { DuseumContext } from '@duseum/shared'

export const cancelBooking = async (
  event: APIGatewayProxyEventV2,
  context: DuseumContext,
  bookingId: string
): Promise<APIGatewayProxyStructuredResultV2> => {
  const body = JSON.parse(event.body ?? '{}') as { reason?: string }
  const { reason } = body

  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    throw new ValidationError('reason is required')
  }

  const booking = await getBookingByBookingId(docClient, bookingId)
  if (!booking) throw new NotFoundError('Booking not found')

  if (booking.featureStatus === 'ARCHIVED' || booking.featureStatus === 'CANCELLED') {
    throw new ConflictError(`Booking cannot be cancelled — current status is ${booking.featureStatus}`)
  }

  const { refundId } = await issueRefund(booking.stripePaymentIntentId)

  const cancelledAt = new Date().toISOString()

  await updateBookingStatus(docClient, booking.isoWeek, booking.authorId, 'CANCELLED', {
    cancelledAt,
    cancelledBy:        context.userId,
    cancellationReason: reason.trim(),
  })

  return ok({ bookingId, featureStatus: 'CANCELLED', refundId, cancelledAt })
}
