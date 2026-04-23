// =============================================================================
// lambdas/maintenance/src/tasks/daily-selection.ts
// Daily Featured Author selection — FR-FEAT-01/03/05
//
// Runs at 00:00 UTC daily via EventBridge. Picks a random ACTIVE Author with
// ≥1 PUBLIC piece, excluding the last 7 selections (FR-FEAT-05). Writes
// DAILY_FEATURED_AUTHOR + DAILY_FEATURED_EXCLUSIONS to config table, and a
// DailyFeatureLog record to the main table.
// =============================================================================

import {
  authorHasPublicPiece,
  docClient,
  getDailyFeatureExclusions,
  listAllActiveAuthors,
  logger,
  setDailyFeaturedAuthor,
  setDailyFeatureExclusions,
  writeDailyFeatureLog,
} from '@duseum/shared'

/** Fisher-Yates shuffle (in-place). Returns the same array. */
const shuffle = <T>(arr: T[]): T[] => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export const runDailySelection = async (): Promise<void> => {
  const now     = new Date()
  const todayIso = now.toISOString().split('T')[0]  // 'YYYY-MM-DD'
  const selectedAt = now.toISOString()

  // ── 1. Load exclusion list ─────────────────────────────────────────────────
  const exclusions = await getDailyFeatureExclusions(docClient)
  const excluded   = new Set(exclusions)

  logger.info('Daily selection starting', {
    date: todayIso,
    exclusionCount: excluded.size,
  })

  // ── 2. Fetch all ACTIVE Authors ─────────────────────────────────────────────
  const allAuthors = await listAllActiveAuthors(docClient)
  logger.info('Active authors fetched', { count: allAuthors.length })

  // ── 3. Filter: must have ≥1 PUBLIC piece + not in exclusion list ───────────
  const candidates: typeof allAuthors = []
  await Promise.all(
    allAuthors
      .filter((a) => !excluded.has(a.userId))
      .map(async (author) => {
        const hasPublic = await authorHasPublicPiece(docClient, author.userId)
        if (hasPublic) candidates.push(author)
      })
  )

  logger.info('Eligible candidates after filtering', { count: candidates.length })

  if (candidates.length === 0) {
    logger.warn('No eligible Authors for daily selection — skipping write', { date: todayIso })
    return
  }

  // ── 4. Random selection ────────────────────────────────────────────────────
  shuffle(candidates)
  const selected = candidates[0]
  logger.info('Selected daily featured author', { authorId: selected.userId, date: todayIso })

  // ── 5. Write config + log (parallel) ──────────────────────────────────────
  const newExclusions = [selected.userId, ...exclusions].slice(0, 7)

  await Promise.all([
    setDailyFeaturedAuthor(docClient, {
      authorId:        selected.userId,
      selectedAt,
      selectionMethod: 'RANDOM',
      overriddenBy:    null,
    }),
    setDailyFeatureExclusions(docClient, newExclusions),
    writeDailyFeatureLog(docClient, {
      date:            todayIso,
      authorId:        selected.userId,
      selectedAt,
      selectionMethod: 'RANDOM',
      overriddenBy:    null,
    }),
  ])

  logger.info('Daily selection complete', {
    authorId: selected.userId,
    newExclusionListLength: newExclusions.length,
  })
}
