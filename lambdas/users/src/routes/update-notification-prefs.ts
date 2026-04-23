// PUT /users/me/notification-preferences — FR-VIEW-09/10, §8.8
// Auth required. Updates global opt-out, defaultPref, per-author overrides.

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  docClient,
  getViewerProfile,
  updateViewerProfile,
  upsertPreference,
  listPreferencesByViewer,
  ok,
} from '@duseum/shared'
import type { DuseumContext, NotificationPref } from '@duseum/shared'

const VALID_PREFS = new Set<string>(['ALL_NEW_PIECES', 'PUBLIC_ONLY', 'NONE'])
const isValidPref = (v: unknown): v is NotificationPref =>
  typeof v === 'string' && VALID_PREFS.has(v)

export const updateNotificationPrefs = async (
  event: APIGatewayProxyEventV2,
  context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2> => {
  if (!context.userId) throw new UnauthorizedError()

  let body: {
    globalOptOut?:        unknown
    defaultPref?:         unknown
    perAuthorOverrides?:  unknown
  }
  try {
    body = JSON.parse(event.body ?? '{}')
  } catch {
    throw new ValidationError('Invalid JSON body')
  }

  const { globalOptOut, defaultPref, perAuthorOverrides } = body

  if (defaultPref !== undefined && !isValidPref(defaultPref)) {
    throw new ValidationError('defaultPref must be ALL_NEW_PIECES, PUBLIC_ONLY, or NONE')
  }
  if (globalOptOut !== undefined && typeof globalOptOut !== 'boolean') {
    throw new ValidationError('globalOptOut must be a boolean')
  }

  const overrides = perAuthorOverrides as Array<{ authorId?: unknown; pref?: unknown }> | undefined
  if (overrides !== undefined) {
    if (!Array.isArray(overrides)) throw new ValidationError('perAuthorOverrides must be an array')
    for (const entry of overrides) {
      if (typeof entry.authorId !== 'string' || !isValidPref(entry.pref)) {
        throw new ValidationError('Each perAuthorOverride must have authorId (string) and pref (valid NotificationPref)')
      }
    }
  }

  const viewer = await getViewerProfile(docClient, context.userId)
  if (!viewer) throw new NotFoundError('Viewer profile not found')

  const updatedAt = new Date().toISOString()

  const writes: Promise<unknown>[] = []

  if (globalOptOut !== undefined || defaultPref !== undefined) {
    writes.push(updateViewerProfile(docClient, context.userId, {
      ...(globalOptOut !== undefined ? { notificationGlobalOptOut: globalOptOut as boolean } : {}),
      ...(defaultPref !== undefined  ? { defaultNotificationPref: defaultPref as NotificationPref } : {}),
    }))
  }

  if (overrides?.length) {
    for (const { authorId, pref } of overrides as Array<{ authorId: string; pref: NotificationPref }>) {
      writes.push(upsertPreference(docClient, context.userId, authorId, pref, updatedAt))
    }
  }

  await Promise.all(writes)

  // Re-fetch fresh state for response
  const [updatedViewer, { items: updatedOverrides }] = await Promise.all([
    getViewerProfile(docClient, context.userId),
    listPreferencesByViewer(docClient, context.userId),
  ])

  return ok({
    globalOptOut:       updatedViewer?.notificationGlobalOptOut ?? false,
    defaultPref:        updatedViewer?.defaultNotificationPref ?? 'ALL_NEW_PIECES',
    perAuthorOverrides: updatedOverrides.map(({ authorId, pref: p, updatedAt: ua }) => ({
      authorId, pref: p, updatedAt: ua,
    })),
  })
}
