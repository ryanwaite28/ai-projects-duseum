// =============================================================================
// packages/shared/src/db/subscriptions.repository.ts
// Repository for Subscription records — Section 4.7, 6.6
//
// Key design (§4.7):
//   Platform Subscription  PK=USER#{userId}  SK=SUB#PLATFORM
//   Author Subscription    PK=USER#{userId}  SK=SUB#AUTHOR#{authorId}
//
// Note: getPlatformSubscription / getAuthorSubscription (status-only reads used
// for access control) live in artworks.repository.ts. This module owns the full
// Subscription type reads and writes used by subscriptions-lambda.
// =============================================================================

import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import type { Subscription, UserAccount } from '../types/index.js'
import { CONFIG_TABLE_NAME, TABLE_NAME } from './client.js'
import { createStripeCustomer } from '../stripe/index.js'

const userKey = (userId: string) =>
  ({ PK: `USER#${userId}`, SK: 'PROFILE' }) as const

// ── Full-type subscription reads ──────────────────────────────────────────────

export const getFullPlatformSubscription = async (
  client: DynamoDBDocumentClient,
  userId: string
): Promise<Subscription | null> => {
  const result = await client.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: 'SUB#PLATFORM' },
    })
  )
  return (result.Item as Subscription) ?? null
}

export const getFullAuthorSubscription = async (
  client: DynamoDBDocumentClient,
  userId: string,
  authorId: string
): Promise<Subscription | null> => {
  const result = await client.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: `SUB#AUTHOR#${authorId}` },
    })
  )
  return (result.Item as Subscription) ?? null
}

export const listUserSubscriptions = async (
  client: DynamoDBDocumentClient,
  userId: string
): Promise<Subscription[]> => {
  const result = await client.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':prefix': 'SUB#' },
    })
  )
  return (result.Items ?? []) as Subscription[]
}

// ── Subscription write ────────────────────────────────────────────────────────

export const upsertSubscription = async (
  client: DynamoDBDocumentClient,
  sub: Subscription
): Promise<void> => {
  const sk = sub.targetId === 'PLATFORM'
    ? 'SUB#PLATFORM'
    : `SUB#AUTHOR#${sub.targetId}`

  await client.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `USER#${sub.userId}`,
        SK: sk,
        ...sub,
      },
    })
  )
}

// ── Author subscriber fan-out reads ──────────────────────────────────────────

export type ListSubscribersResult = {
  items:   Subscription[]
  lastKey: Record<string, unknown> | undefined
}

/**
 * Lists ACTIVE Author Subscribers for an author via GSI-SubscribersByAuthor.
 * Used by notifications-lambda for PRIVATE piece fan-out.
 */
export const listAuthorSubscribersByAuthor = async (
  client: DynamoDBDocumentClient,
  authorId: string,
  lastKey?: Record<string, unknown>
): Promise<ListSubscribersResult> => {
  const result = await client.send(
    new QueryCommand({
      TableName:                 TABLE_NAME,
      IndexName:                 'GSI-SubscribersByAuthor',
      KeyConditionExpression:    'authorId = :authorId',
      FilterExpression:          '#status = :active',
      ExpressionAttributeNames:  { '#status': 'status' },
      ExpressionAttributeValues: { ':authorId': authorId, ':active': 'ACTIVE' },
      ExclusiveStartKey:         lastKey,
      Limit:                     500,
    })
  )
  return {
    items:   (result.Items ?? []) as Subscription[],
    lastKey: result.LastEvaluatedKey as Record<string, unknown> | undefined,
  }
}

// ── Config reads ──────────────────────────────────────────────────────────────

export const getConfigValue = async (
  client: DynamoDBDocumentClient,
  key: string
): Promise<string | null> => {
  const result = await client.send(
    new GetCommand({
      TableName: CONFIG_TABLE_NAME,
      Key: { PK: 'CONFIG', SK: key },
    })
  )
  return (result.Item?.value as string) ?? null
}

// ── Stripe customer resolution ────────────────────────────────────────────────

/**
 * Returns the Stripe Customer ID for a user. If none exists yet, creates a
 * Stripe Customer using the email stored in UserAccount and writes the ID back.
 */
export const getOrCreateStripeCustomer = async (
  client: DynamoDBDocumentClient,
  userId: string
): Promise<string> => {
  const accountResult = await client.send(
    new GetCommand({ TableName: TABLE_NAME, Key: userKey(userId) })
  )
  const account = accountResult.Item as (UserAccount & { stripeCustomerId?: string }) | undefined

  if (account?.stripeCustomerId) return account.stripeCustomerId

  const customer = await createStripeCustomer({
    email: account?.email,
    metadata: { userId },
  })

  await client.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: userKey(userId),
      UpdateExpression: 'SET stripeCustomerId = :cid',
      ExpressionAttributeValues: { ':cid': customer.id },
    })
  )

  return customer.id
}
