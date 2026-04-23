// =============================================================================
// packages/shared/src/db/upload-intents.repository.ts
// Repository for UploadIntent records — Section 4.3, 6.6.
//
// Key design (§4.7):
//   UploadIntent  PK=UPLOAD#{intentId}  SK=METADATA
// =============================================================================

import {
  ConditionalCheckFailedException,
} from '@aws-sdk/client-dynamodb'
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import type { UploadIntent } from '../types/index.js'
import { TABLE_NAME } from './client.js'

// ── Key helper ────────────────────────────────────────────────────────────────

const uploadIntentKey = (intentId: string) =>
  ({ PK: `UPLOAD#${intentId}`, SK: 'METADATA' }) as const

// ── Writes ────────────────────────────────────────────────────────────────────

/**
 * Persists a new UploadIntent with status PENDING.
 * Throws ConditionalCheckFailedException (re-raised) if intentId already exists —
 * callers use UUID v4 so collision is effectively impossible in practice.
 */
export const createUploadIntent = async (
  client: DynamoDBDocumentClient,
  intent: UploadIntent
): Promise<void> => {
  await client.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        ...uploadIntentKey(intent.intentId),
        ...intent,
      },
      ConditionExpression: 'attribute_not_exists(PK)',
    })
  )
}

/**
 * Transitions an UploadIntent from PENDING → CONSUMED.
 * Idempotency guard: the ConditionExpression prevents double-consume; if the
 * intent is already CONSUMED or does not exist, throws ConditionalCheckFailedException.
 */
export const markUploadIntentConsumed = async (
  client: DynamoDBDocumentClient,
  intentId: string
): Promise<void> => {
  try {
    await client.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: uploadIntentKey(intentId),
        UpdateExpression: 'SET #s = :consumed',
        ConditionExpression: 'attribute_exists(PK) AND #s = :pending',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':consumed': 'CONSUMED',
          ':pending': 'PENDING',
        },
      })
    )
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) throw err
    throw err
  }
}

// ── Reads ─────────────────────────────────────────────────────────────────────

/**
 * Returns the UploadIntent for a given intentId, or `null` if not found.
 */
export const getUploadIntent = async (
  client: DynamoDBDocumentClient,
  intentId: string
): Promise<UploadIntent | null> => {
  const result = await client.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: uploadIntentKey(intentId),
    })
  )
  return (result.Item as UploadIntent) ?? null
}

// ── Maintenance cleanup ────────────────────────────────────────────────────────

/**
 * Scans the table for PENDING or EXPIRED UploadIntent records whose
 * createdAt is older than `cutoffIso` and deletes them in batches of 25.
 * Called by maintenance-lambda daily cleanup task.
 *
 * Returns the count of deleted items.
 */
export const deleteStalePendingIntents = async (
  client: DynamoDBDocumentClient,
  cutoffIso: string
): Promise<number> => {
  let deleted = 0
  let lastKey: Record<string, unknown> | undefined

  do {
    const page = await client.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression:
          '(#s = :pending OR #s = :expired) AND begins_with(PK, :prefix) AND createdAt < :cutoff',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':pending': 'PENDING',
          ':expired': 'EXPIRED',
          ':prefix':  'UPLOAD#',
          ':cutoff':  cutoffIso,
        },
        ProjectionExpression: 'PK, SK',
        ExclusiveStartKey: lastKey,
      })
    )

    const items = page.Items ?? []
    for (const item of items) {
      await client.send(
        new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { PK: item['PK'], SK: item['SK'] },
        })
      )
      deleted++
    }

    lastKey = page.LastEvaluatedKey as Record<string, unknown> | undefined
  } while (lastKey)

  return deleted
}
