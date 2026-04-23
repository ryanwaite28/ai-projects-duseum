// GET /users/me/notification-preferences — FR-VIEW-09, §8.8
// Auth required. Returns global prefs + all per-author overrides.

import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import {
  NotFoundError,
  UnauthorizedError,
  docClient,
  getViewerProfile,
  listPreferencesByViewer,
  ok,
} from '@duseum/shared'
import type { DuseumContext } from '@duseum/shared'

export const getNotificationPrefs = async (
  context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2> => {
  if (!context.userId) throw new UnauthorizedError()

  const viewer = await getViewerProfile(docClient, context.userId)
  if (!viewer) throw new NotFoundError('Viewer profile not found')

  const { items: overrides } = await listPreferencesByViewer(docClient, context.userId)

  return ok({
    globalOptOut:       viewer.notificationGlobalOptOut,
    defaultPref:        viewer.defaultNotificationPref,
    perAuthorOverrides: overrides.map(({ authorId, pref, updatedAt }) => ({
      authorId,
      pref,
      updatedAt,
    })),
  })
}
