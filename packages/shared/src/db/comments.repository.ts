// =============================================================================
// packages/shared/src/db/comments.repository.ts
// Repository for Comment records — Section 4.7, FR-SOC-02–04.
//
// Key design (§4.7):
//   Comment item    PK=ARTWORK#{artworkId}  SK=COMMENT#{createdAt}#{commentId}
//   Lookup shadow   PK=COMMENT#{commentId} SK=METADATA
//
// The shadow item allows DELETE /comments/{commentId} to resolve the full key
// and verify ownership without the caller knowing createdAt.
// =============================================================================

import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import type { Comment } from '../types/index.js'
import { TABLE_NAME } from './client.js'

// ── Key helpers ───────────────────────────────────────────────────────────────

const commentKey = (artworkId: string, createdAt: string, commentId: string) =>
  ({ PK: `ARTWORK#${artworkId}`, SK: `COMMENT#${createdAt}#${commentId}` }) as const

const commentLookupKey = (commentId: string) =>
  ({ PK: `COMMENT#${commentId}`, SK: 'METADATA' }) as const

const commentSkPrefix = () => 'COMMENT#'

// ── Shadow lookup type ────────────────────────────────────────────────────────

export type CommentLookup = {
  commentId:       string
  artworkId:       string
  artworkAuthorId: string   // userId of the piece owner (for delete authorization)
  authorId:        string   // userId of commenter
  sk:              string   // full SK of the real comment item
  createdAt:       string
}

// ── Input types ───────────────────────────────────────────────────────────────

export type CreateCommentInput = {
  commentId:       string
  artworkId:       string
  artworkAuthorId: string
  authorId:        string
  body:            string
  parentCommentId: string | null
  createdAt:       string
}

// ── Writes ────────────────────────────────────────────────────────────────────

/**
 * Writes the Comment item + shadow lookup item and increments commentCount
 * on the artwork METADATA item — all as a DynamoDB transaction.
 */
export const createComment = async (
  client: DynamoDBDocumentClient,
  input: CreateCommentInput
): Promise<Comment> => {
  const { commentId, artworkId, artworkAuthorId, authorId, body, parentCommentId, createdAt } = input
  const sk = `COMMENT#${createdAt}#${commentId}`

  const comment: Comment = {
    commentId,
    artworkId,
    authorId,
    body,
    parentCommentId,
    isPinned:  false,
    isDeleted: false,
    createdAt,
  }

  const shadowItem: CommentLookup = {
    commentId,
    artworkId,
    artworkAuthorId,
    authorId,
    sk,
    createdAt,
  }

  await client.send(new TransactWriteCommand({
    TransactItems: [
      {
        Put: {
          TableName: TABLE_NAME,
          Item: {
            PK: `ARTWORK#${artworkId}`,
            SK: sk,
            ...comment,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      {
        Put: {
          TableName: TABLE_NAME,
          Item: {
            ...commentLookupKey(commentId),
            ...shadowItem,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      {
        Update: {
          TableName: TABLE_NAME,
          Key: { PK: `ARTWORK#${artworkId}`, SK: 'METADATA' },
          UpdateExpression: 'ADD commentCount :one',
          ExpressionAttributeValues: { ':one': 1 },
          ConditionExpression: 'attribute_exists(PK)',
        },
      },
    ],
  }))

  return comment
}

/**
 * Soft-deletes a comment and decrements commentCount on the artwork.
 * Does NOT delete the shadow lookup item (needed for future audit/admin use).
 */
export const softDeleteComment = async (
  client: DynamoDBDocumentClient,
  artworkId: string,
  commentSk: string,
  deletedBy: string,
  deletedAt: string
): Promise<void> => {
  await client.send(new TransactWriteCommand({
    TransactItems: [
      {
        Update: {
          TableName: TABLE_NAME,
          Key: { PK: `ARTWORK#${artworkId}`, SK: commentSk },
          UpdateExpression: 'SET isDeleted = :t, deletedAt = :da, deletedBy = :db',
          ConditionExpression: 'attribute_exists(PK) AND isDeleted = :f',
          ExpressionAttributeValues: { ':t': true, ':f': false, ':da': deletedAt, ':db': deletedBy },
        },
      },
      {
        Update: {
          TableName: TABLE_NAME,
          Key: { PK: `ARTWORK#${artworkId}`, SK: 'METADATA' },
          UpdateExpression: 'ADD commentCount :neg',
          ExpressionAttributeValues: { ':neg': -1 },
          ConditionExpression: 'attribute_exists(PK)',
        },
      },
    ],
  }))
}

/**
 * Toggles isPinned on a comment. Caller must enforce the 2-pin limit.
 */
export const pinComment = async (
  client: DynamoDBDocumentClient,
  artworkId: string,
  commentSk: string,
  pinned: boolean
): Promise<void> => {
  await client.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: `ARTWORK#${artworkId}`, SK: commentSk },
    UpdateExpression: 'SET isPinned = :p',
    ConditionExpression: 'attribute_exists(PK)',
    ExpressionAttributeValues: { ':p': pinned },
  }))
}

// ── Reads ─────────────────────────────────────────────────────────────────────

export type ListCommentsInput = {
  artworkId: string
  limit?:    number
  lastKey?:  Record<string, unknown>
}

export type ListCommentsResult = {
  items:   (Comment & { PK: string; SK: string })[]
  lastKey: Record<string, unknown> | undefined
}

/**
 * Lists comments for an artwork, pinned first, then by SK (createdAt) order.
 * Returns raw DynamoDB items (with PK/SK) so callers can use SK for cursor.
 */
export const listComments = async (
  client: DynamoDBDocumentClient,
  input: ListCommentsInput
): Promise<ListCommentsResult> => {
  const limit = Math.min(input.limit ?? 20, 50)

  const result = await client.send(new QueryCommand({
    TableName:                 TABLE_NAME,
    KeyConditionExpression:    'PK = :pk AND begins_with(SK, :prefix)',
    ExpressionAttributeValues: {
      ':pk':     `ARTWORK#${input.artworkId}`,
      ':prefix': commentSkPrefix(),
    },
    ExclusiveStartKey:         input.lastKey,
    Limit:                     limit,
    ScanIndexForward:          true,
  }))

  const items = (result.Items ?? []) as (Comment & { PK: string; SK: string })[]

  // Pinned comments float to top; stable sort preserves createdAt order within each group
  items.sort((a, b) => {
    if (a.isPinned === b.isPinned) return 0
    return a.isPinned ? -1 : 1
  })

  return {
    items,
    lastKey: result.LastEvaluatedKey as Record<string, unknown> | undefined,
  }
}

/**
 * Resolves a commentId to its shadow lookup record.
 * Returns null if the comment does not exist.
 */
export const getCommentLookup = async (
  client: DynamoDBDocumentClient,
  commentId: string
): Promise<CommentLookup | null> => {
  const result = await client.send(new GetCommand({
    TableName: TABLE_NAME,
    Key:       commentLookupKey(commentId),
  }))
  return (result.Item as CommentLookup) ?? null
}

/**
 * Fetches the full comment item by artworkId + SK (from shadow lookup).
 */
export const getCommentBySk = async (
  client: DynamoDBDocumentClient,
  artworkId: string,
  sk: string
): Promise<(Comment & { PK: string; SK: string }) | null> => {
  const result = await client.send(new GetCommand({
    TableName: TABLE_NAME,
    Key:       { PK: `ARTWORK#${artworkId}`, SK: sk },
  }))
  return (result.Item as (Comment & { PK: string; SK: string })) ?? null
}

/**
 * Looks up a parent comment to validate one-level nesting.
 * Returns the comment or null.
 */
export const getParentComment = async (
  client: DynamoDBDocumentClient,
  artworkId: string,
  parentCommentId: string
): Promise<(Comment & { SK: string }) | null> => {
  const lookup = await getCommentLookup(client, parentCommentId)
  if (!lookup) return null
  const item = await getCommentBySk(client, artworkId, lookup.sk)
  return item ?? null
}

/**
 * Returns the number of currently pinned comments on an artwork (0, 1, or 2).
 */
export const countPinnedComments = async (
  client: DynamoDBDocumentClient,
  artworkId: string
): Promise<number> => {
  const result = await client.send(new QueryCommand({
    TableName:                 TABLE_NAME,
    KeyConditionExpression:    'PK = :pk AND begins_with(SK, :prefix)',
    FilterExpression:          'isPinned = :t',
    ExpressionAttributeValues: { ':pk': `ARTWORK#${artworkId}`, ':prefix': 'COMMENT#', ':t': true },
    Select:                    'COUNT',
  }))
  return result.Count ?? 0
}

/**
 * Deletes both the shadow lookup item and the real comment item.
 * Used for hard deletes (admin/cleanup path) — not used in the soft-delete route.
 */
export const hardDeleteComment = async (
  client: DynamoDBDocumentClient,
  artworkId: string,
  sk: string,
  commentId: string
): Promise<void> => {
  await Promise.all([
    client.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { PK: `ARTWORK#${artworkId}`, SK: sk } })),
    client.send(new DeleteCommand({ TableName: TABLE_NAME, Key: commentLookupKey(commentId) })),
  ])
}
