// =============================================================================
// packages/shared/src/db/reactions.repository.ts
// Repository for Reaction records — Section 4.7, FR-SOC-01.
//
// Key design (§4.7):
//   Reaction item   PK=ARTWORK#{artworkId}  SK=REACTION#{userId}
//
// Reaction counts are maintained directly on the artwork METADATA item via
// atomic ADD expressions to avoid a fan-out query on every piece detail load.
// =============================================================================

import {
  DeleteCommand,
  GetCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb'
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import type { Reaction } from '../types/index.js'
import { TABLE_NAME } from './client.js'

// ── Key helpers ───────────────────────────────────────────────────────────────

const reactionKey = (artworkId: string, userId: string) =>
  ({ PK: `ARTWORK#${artworkId}`, SK: `REACTION#${userId}` }) as const

const artworkMetaKey = (artworkId: string) =>
  ({ PK: `ARTWORK#${artworkId}`, SK: 'METADATA' }) as const

// ── Type helpers ──────────────────────────────────────────────────────────────

export type ReactionType = 'LOVE' | 'WOW' | 'FIRE' | 'INSPIRED'

const VALID_REACTION_TYPES = new Set<string>(['LOVE', 'WOW', 'FIRE', 'INSPIRED'])
export const isValidReactionType = (v: unknown): v is ReactionType =>
  typeof v === 'string' && VALID_REACTION_TYPES.has(v)

const countAttr = (type: ReactionType) => `reactionCounts.${type}`

// ── Reads ─────────────────────────────────────────────────────────────────────

/**
 * Returns the user's current reaction on an artwork, or null if none.
 */
export const getUserReaction = async (
  client: DynamoDBDocumentClient,
  artworkId: string,
  userId: string
): Promise<Reaction | null> => {
  const result = await client.send(new GetCommand({
    TableName: TABLE_NAME,
    Key:       reactionKey(artworkId, userId),
  }))
  return (result.Item as Reaction) ?? null
}

/**
 * Returns the reactionCounts map from the artwork METADATA item.
 * Returns an empty record if the item has no counts yet.
 */
export const getReactionCounts = async (
  client: DynamoDBDocumentClient,
  artworkId: string
): Promise<Record<ReactionType, number>> => {
  const result = await client.send(new GetCommand({
    TableName:            TABLE_NAME,
    Key:                  artworkMetaKey(artworkId),
    ProjectionExpression: 'reactionCounts',
  }))
  return ((result.Item?.reactionCounts as Record<ReactionType, number>) ?? {}) as Record<ReactionType, number>
}

// ── Writes ────────────────────────────────────────────────────────────────────

/**
 * Upserts a reaction for a user on an artwork.
 *
 * - If the user has no prior reaction: writes the item and ADD +1 to the new type.
 * - If the user is changing type: overwrites the item, ADD -1 to old type, +1 to new type.
 * - If the user is reacting with the same type: no-op (caller should short-circuit before calling).
 *
 * Returns the new Reaction record.
 */
export const upsertReaction = async (
  client: DynamoDBDocumentClient,
  artworkId: string,
  userId: string,
  reactionType: ReactionType,
  reactedAt: string,
  previousType?: ReactionType
): Promise<Reaction> => {
  const reaction: Reaction = { artworkId, userId, reactionType, reactedAt }

  const newCountAttr = countAttr(reactionType)

  if (previousType && previousType !== reactionType) {
    const oldCountAttr = countAttr(previousType)
    await client.send(new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: TABLE_NAME,
            Item: { ...reactionKey(artworkId, userId), ...reaction },
          },
        },
        {
          Update: {
            TableName:                 TABLE_NAME,
            Key:                       artworkMetaKey(artworkId),
            UpdateExpression:          `ADD #newCount :one, #oldCount :neg`,
            ExpressionAttributeNames:  { '#newCount': newCountAttr, '#oldCount': oldCountAttr },
            ExpressionAttributeValues: { ':one': 1, ':neg': -1 },
            ConditionExpression:       'attribute_exists(PK)',
          },
        },
      ],
    }))
  } else {
    await client.send(new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: TABLE_NAME,
            Item: { ...reactionKey(artworkId, userId), ...reaction },
          },
        },
        {
          Update: {
            TableName:                 TABLE_NAME,
            Key:                       artworkMetaKey(artworkId),
            UpdateExpression:          `ADD #count :one`,
            ExpressionAttributeNames:  { '#count': newCountAttr },
            ExpressionAttributeValues: { ':one': 1 },
            ConditionExpression:       'attribute_exists(PK)',
          },
        },
      ],
    }))
  }

  return reaction
}

/**
 * Deletes a user's reaction and decrements the count on the artwork METADATA.
 */
export const deleteReaction = async (
  client: DynamoDBDocumentClient,
  artworkId: string,
  userId: string,
  reactionType: ReactionType
): Promise<void> => {
  const attr = countAttr(reactionType)
  await client.send(new TransactWriteCommand({
    TransactItems: [
      {
        Delete: {
          TableName:           TABLE_NAME,
          Key:                 reactionKey(artworkId, userId),
          ConditionExpression: 'attribute_exists(PK)',
        },
      },
      {
        Update: {
          TableName:                 TABLE_NAME,
          Key:                       artworkMetaKey(artworkId),
          UpdateExpression:          `ADD #count :neg`,
          ExpressionAttributeNames:  { '#count': attr },
          ExpressionAttributeValues: { ':neg': -1 },
          ConditionExpression:       'attribute_exists(PK)',
        },
      },
    ],
  }))
}
