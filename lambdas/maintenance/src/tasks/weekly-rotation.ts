// =============================================================================
// lambdas/maintenance/src/tasks/weekly-rotation.ts
// Weekly Featured Author rotation — FR-FEAT-15
//
// Runs at Monday 00:00 UTC via EventBridge.
//   - CONFIRMED bookings for currentWeek  → ACTIVE  (record activatedAt)
//   - ACTIVE   bookings for previousWeek  → ARCHIVED
// =============================================================================

import {
  addWeeks,
  docClient,
  getCurrentIsoWeek,
  listBookingsByStatusAndWeek,
  logger,
  updateBookingStatus,
} from '@duseum/shared'

export const runWeeklyRotation = async (): Promise<void> => {
  const currentWeek  = getCurrentIsoWeek()
  const previousWeek = addWeeks(currentWeek, -1)
  const now          = new Date().toISOString()

  logger.info('Weekly rotation starting', { currentWeek, previousWeek })

  // ── Activate CONFIRMED bookings for current week ──────────────────────────
  const toActivate = await listBookingsByStatusAndWeek(docClient, 'CONFIRMED', currentWeek)
  logger.info('Bookings to activate', { count: toActivate.length, isoWeek: currentWeek })

  await Promise.all(
    toActivate.map((b) =>
      updateBookingStatus(docClient, b.isoWeek, b.authorId, 'ACTIVE', { activatedAt: now })
    )
  )

  // ── Archive ACTIVE bookings from previous week ────────────────────────────
  const toArchive = await listBookingsByStatusAndWeek(docClient, 'ACTIVE', previousWeek)
  logger.info('Bookings to archive', { count: toArchive.length, isoWeek: previousWeek })

  await Promise.all(
    toArchive.map((b) =>
      updateBookingStatus(docClient, b.isoWeek, b.authorId, 'ARCHIVED')
    )
  )

  // ── Safety net: archive any CONFIRMED bookings that missed last week's rotation
  // (e.g. payment confirmed after Monday 00:00 UTC for a past week)
  const toArchiveConfirmed = await listBookingsByStatusAndWeek(docClient, 'CONFIRMED', previousWeek)
  logger.info('Stale CONFIRMED previous-week bookings to archive', { count: toArchiveConfirmed.length, isoWeek: previousWeek })

  await Promise.all(
    toArchiveConfirmed.map((b) =>
      updateBookingStatus(docClient, b.isoWeek, b.authorId, 'ARCHIVED')
    )
  )

  logger.info('Weekly rotation complete', {
    activated:       toActivate.length,
    archived:        toArchive.length,
    archivedStale:   toArchiveConfirmed.length,
  })
}
