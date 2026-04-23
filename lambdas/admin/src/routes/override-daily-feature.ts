// =============================================================================
// lambdas/admin/src/routes/override-daily-feature.ts
// PUT /admin/features/daily/override — FR-ADMIN-04
//
// Admin overrides today's Daily Featured Author. Reads the current selection
// to capture previousAuthorId, then writes DAILY_FEATURED_AUTHOR with
// selectionMethod=ADMIN_OVERRIDE and logs the override.
// =============================================================================

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import {
  NotFoundError,
  ValidationError,
  docClient,
  getDailyFeaturedAuthor,
  getAuthorProfile,
  ok,
  setDailyFeaturedAuthor,
  writeDailyFeatureLog,
} from '@duseum/shared'
import type { DuseumContext } from '@duseum/shared'

export const overrideDailyFeature = async (
  event: APIGatewayProxyEventV2,
  context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2> => {
  const body = JSON.parse(event.body ?? '{}') as { authorId?: string }
  const { authorId } = body

  if (!authorId || typeof authorId !== 'string') {
    throw new ValidationError('authorId is required')
  }

  // Validate target author exists and is ACTIVE
  const author = await getAuthorProfile(docClient, authorId)
  if (!author || author.status !== 'ACTIVE') {
    throw new NotFoundError('Author not found or not active')
  }

  // Capture current selection for response
  const current      = await getDailyFeaturedAuthor(docClient)
  const previousAuthorId = current?.authorId ?? null

  const now        = new Date()
  const todayIso   = now.toISOString().split('T')[0]
  const selectedAt = now.toISOString()

  await Promise.all([
    setDailyFeaturedAuthor(docClient, {
      authorId,
      selectedAt,
      selectionMethod: 'ADMIN_OVERRIDE',
      overriddenBy:    context.userId,
    }),
    writeDailyFeatureLog(docClient, {
      date:            todayIso,
      authorId,
      selectedAt,
      selectionMethod: 'ADMIN_OVERRIDE',
      overriddenBy:    context.userId,
    }),
  ])

  return ok({ date: todayIso, authorId, overriddenBy: context.userId, previousAuthorId })
}
