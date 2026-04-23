// =============================================================================
// packages/shared/src/db/idempotency.repository.ts
// Idempotency table helpers — Section 4.7, NFR-REL-01
//
// Key design:
//   PK=STRIPE#{eventId}  (no SK — single-attribute primary key)
//   ttl                  — epoch seconds; DynamoDB auto-expires after 7 days
//
// Pattern: checkProcessed() before handling; markProcessed() after success.
// Separating check from mark lets the handler decide when to mark (only after
// the actual DynamoDB write succeeds, not before).
// =============================================================================

import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { IDEMPOTENCY_TABLE_NAME } from './client.js'

const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60

const idempotencyKey = (eventId: string) =>
  ({ PK: `STRIPE#${eventId}` }) as const

export const checkProcessed = async (
  client: DynamoDBDocumentClient,
  eventId: string
): Promise<boolean> => {
  const result = await client.send(
    new GetCommand({
      TableName: IDEMPOTENCY_TABLE_NAME,
      Key: idempotencyKey(eventId),
    })
  )
  return result.Item !== undefined
}

export const markProcessed = async (
  client: DynamoDBDocumentClient,
  eventId: string
): Promise<void> => {
  const ttl = Math.floor(Date.now() / 1000) + SEVEN_DAYS_SECONDS
  await client.send(
    new PutCommand({
      TableName: IDEMPOTENCY_TABLE_NAME,
      Item: {
        ...idempotencyKey(eventId),
        processedAt: new Date().toISOString(),
        ttl,
      },
      // Conditional write: if item already exists another process beat us here —
      // that is fine; attribute_not_exists check prevents overwriting TTL.
      ConditionExpression: 'attribute_not_exists(PK)',
    })
  )
}
