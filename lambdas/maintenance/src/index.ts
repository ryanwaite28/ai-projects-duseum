// =============================================================================
// lambdas/maintenance/src/index.ts
// maintenance-lambda — Section 4.2, FR-FEAT-03/15
//
// EventBridge handler dispatched by rule name (env vars point to the ARN suffix):
//
//   DAILY_FEATURE_RULE_NAME   → daily selection + upload-intent cleanup
//   WEEKLY_ROTATION_RULE_NAME → weekly feature rotation
//
// Rule name is matched against event.resources[0] (the full rule ARN).
// Unknown resources are logged as a WARNING and ignored — never error.
// =============================================================================

import type { EventBridgeEvent } from 'aws-lambda'
import { logger } from '@duseum/shared'
import { runDailySelection }       from './tasks/daily-selection.js'
import { runWeeklyRotation }       from './tasks/weekly-rotation.js'
import { runUploadIntentCleanup }  from './tasks/upload-intent-cleanup.js'

export const handler = async (event: EventBridgeEvent<string, unknown>): Promise<void> => {
  const resource         = event.resources?.[0] ?? ''
  const dailyRuleName    = process.env.DAILY_FEATURE_RULE_NAME!
  const weeklyRuleName   = process.env.WEEKLY_ROTATION_RULE_NAME!

  logger.info('maintenance-lambda invoked', { resource })

  if (resource.includes(dailyRuleName)) {
    // Daily 00:00 UTC: author selection + stale intent cleanup (run in parallel)
    await Promise.all([
      runDailySelection(),
      runUploadIntentCleanup(),
    ])
    return
  }

  if (resource.includes(weeklyRuleName)) {
    // Monday 00:00 UTC: weekly feature rotation
    await runWeeklyRotation()
    return
  }

  logger.warn('maintenance-lambda received unknown EventBridge rule — ignoring', { resource })
}
