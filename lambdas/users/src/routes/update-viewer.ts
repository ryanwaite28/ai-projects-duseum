// =============================================================================
// lambdas/users/src/routes/update-viewer.ts
// PUT /users/me/viewer — update ViewerProfile settings (§8.4, FR-VIEW-09/10)
// =============================================================================

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { z } from 'zod'
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  docClient,
  getViewerProfile,
  ok,
  updateViewerProfile,
} from '@duseum/shared'
import type { DuseumContext } from '@duseum/shared'

const NotificationPrefEnum = z.enum(['ALL_NEW_PIECES', 'PUBLIC_ONLY', 'NONE'])

const schema = z.object({
  displayName:             z.string().min(1).max(100).optional(),
  notificationGlobalOptOut: z.boolean().optional(),
  defaultNotificationPref: NotificationPrefEnum.optional(),
}).refine(
  (d) => Object.keys(d).length > 0,
  { message: 'At least one field must be provided' }
)

export const updateViewer = async (
  event: APIGatewayProxyEventV2,
  context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2> => {
  const { userId } = context
  if (!userId) throw new UnauthorizedError()

  const parsed = schema.safeParse(JSON.parse(event.body ?? '{}'))
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input')

  const existing = await getViewerProfile(docClient, userId)
  if (!existing) throw new NotFoundError('Viewer profile not found')

  const updated = await updateViewerProfile(docClient, userId, parsed.data)
  return ok(updated)
}
