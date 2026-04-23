// =============================================================================
// lambdas/maintenance/src/tasks/upload-intent-cleanup.ts
// Stale UploadIntent cleanup — Section 4.2 (maintenance-lambda duties)
//
// Runs on the daily schedule alongside the daily selection task.
// Deletes any PENDING or EXPIRED UploadIntent records created more than 24 hours ago.
// =============================================================================

import { deleteStalePendingIntents, docClient, logger } from '@duseum/shared'

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000

export const runUploadIntentCleanup = async (): Promise<void> => {
  const cutoffIso = new Date(Date.now() - TWENTY_FOUR_HOURS_MS).toISOString()
  logger.info('Upload intent cleanup starting', { cutoff: cutoffIso })

  const deleted = await deleteStalePendingIntents(docClient, cutoffIso)
  logger.info('Upload intent cleanup complete', { deleted })
}
