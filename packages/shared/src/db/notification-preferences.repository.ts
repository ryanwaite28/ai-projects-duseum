// =============================================================================
// packages/shared/src/db/notification-preferences.repository.ts
// Repository for NotificationPreference records — Section 4.7, FR-VIEW-09.
//
// Key design (§4.7):
//   NotificationPreference  PK=USER#{viewerId}  SK=NOTIF_PREF#AUTHOR#{authorId}
// =============================================================================

import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb'
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import type { NotificationPref, NotificationPreference } from '../types/index.js'
import { TABLE_NAME } from './client.js'

// ── Key helpers ───────────────────────────────────────────────────────────────

const prefKey = (viewerId: string, authorId: string) =>
  ({ PK: `USER#${viewerId}`, SK: `NOTIF_PREF#AUTHOR#${authorId}` }) as const

// ── Writes ────────────────────────────────────────────────────────────────────

/**
 * Creates or overwrites a per-Author notification preference for a viewer.
 */
export const upsertPreference = async (
  client: DynamoDBDocumentClient,
  viewerId: string,
  authorId: string,
  pref: NotificationPref,
  updatedAt: string = new Date().toISOString()
): Promise<NotificationPreference> => {
  const record: NotificationPreference = { viewerId, authorId, pref, updatedAt }
  await client.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      ...prefKey(viewerId, authorId),
      ...record,
    },
  }))
  return record
}

/**
 * Deletes the per-Author preference record for a viewer.
 * Silent no-op if the record does not exist.
 */
export const deletePreference = async (
  client: DynamoDBDocumentClient,
  viewerId: string,
  authorId: string
): Promise<void> => {
  await client.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key:       prefKey(viewerId, authorId),
  }))
}

// ── Reads ─────────────────────────────────────────────────────────────────────

/**
 * Returns the per-Author preference for a viewer, or null if none exists.
 * Absent means the viewer's `defaultNotificationPref` should be used.
 */
export const getPreference = async (
  client: DynamoDBDocumentClient,
  viewerId: string,
  authorId: string
): Promise<NotificationPreference | null> => {
  const result = await client.send(new GetCommand({
    TableName: TABLE_NAME,
    Key:       prefKey(viewerId, authorId),
  }))
  return (result.Item as NotificationPreference) ?? null
}

export type ListPreferencesResult = {
  items:   NotificationPreference[]
  lastKey: Record<string, unknown> | undefined
}

/**
 * Lists all per-Author preference overrides for a viewer, paginated.
 */
export const listPreferencesByViewer = async (
  client: DynamoDBDocumentClient,
  viewerId: string,
  limit = 100,
  lastKey?: Record<string, unknown>
): Promise<ListPreferencesResult> => {
  const result = await client.send(new QueryCommand({
    TableName:                 TABLE_NAME,
    KeyConditionExpression:    'PK = :pk AND begins_with(SK, :prefix)',
    ExpressionAttributeValues: {
      ':pk':     `USER#${viewerId}`,
      ':prefix': 'NOTIF_PREF#AUTHOR#',
    },
    ExclusiveStartKey: lastKey,
    Limit:             Math.min(limit, 200),
    ScanIndexForward:  true,
  }))
  return {
    items:   (result.Items ?? []) as NotificationPreference[],
    lastKey: result.LastEvaluatedKey as Record<string, unknown> | undefined,
  }
}
