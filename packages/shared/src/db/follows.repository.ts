// =============================================================================
// packages/shared/src/db/follows.repository.ts
// Repository for Follow records — Section 4.7, FR-VIEW-06/06a.
//
// Key design (§4.7):
//   Follow item    PK=USER#{viewerId}  SK=FOLLOW#AUTHOR#{authorId}
//   GSI-FollowersByAuthor: authorId (follow record) / followedAt
// =============================================================================

import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb'
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { TABLE_NAME } from './client.js'

// ── Key helpers ───────────────────────────────────────────────────────────────

const followKey = (viewerId: string, authorId: string) =>
  ({ PK: `USER#${viewerId}`, SK: `FOLLOW#AUTHOR#${authorId}` }) as const

// ── Types ─────────────────────────────────────────────────────────────────────

export type FollowRecord = {
  viewerId:   string
  authorId:   string
  followedAt: string
}

// ── Writes ────────────────────────────────────────────────────────────────────

/**
 * Creates a Follow record. Does NOT check for duplicates — caller must do so.
 * Stores `authorId` as a top-level attribute for GSI-FollowersByAuthor.
 */
export const createFollow = async (
  client: DynamoDBDocumentClient,
  viewerId: string,
  authorId: string,
  followedAt: string
): Promise<FollowRecord> => {
  const record: FollowRecord = { viewerId, authorId, followedAt }
  await client.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      ...followKey(viewerId, authorId),
      ...record,
    },
    ConditionExpression: 'attribute_not_exists(PK)',
  }))
  return record
}

/**
 * Deletes a Follow record. Silent no-op if item does not exist.
 */
export const deleteFollow = async (
  client: DynamoDBDocumentClient,
  viewerId: string,
  authorId: string
): Promise<void> => {
  await client.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key:       followKey(viewerId, authorId),
  }))
}

// ── Reads ─────────────────────────────────────────────────────────────────────

/**
 * Returns the Follow record if the viewer follows the author, else null.
 */
export const getFollow = async (
  client: DynamoDBDocumentClient,
  viewerId: string,
  authorId: string
): Promise<FollowRecord | null> => {
  const result = await client.send(new GetCommand({
    TableName: TABLE_NAME,
    Key:       followKey(viewerId, authorId),
  }))
  return (result.Item as FollowRecord) ?? null
}

export type ListFollowsByViewerInput = {
  viewerId:  string
  limit?:    number
  lastKey?:  Record<string, unknown>
}

export type ListFollowsResult = {
  items:   FollowRecord[]
  lastKey: Record<string, unknown> | undefined
}

/**
 * Lists all authors a viewer follows, paginated by SK cursor.
 */
export const listFollowsByViewer = async (
  client: DynamoDBDocumentClient,
  input: ListFollowsByViewerInput
): Promise<ListFollowsResult> => {
  const limit = Math.min(input.limit ?? 20, 50)
  const result = await client.send(new QueryCommand({
    TableName:                 TABLE_NAME,
    KeyConditionExpression:    'PK = :pk AND begins_with(SK, :prefix)',
    ExpressionAttributeValues: {
      ':pk':     `USER#${input.viewerId}`,
      ':prefix': 'FOLLOW#AUTHOR#',
    },
    ExclusiveStartKey: input.lastKey,
    Limit:             limit,
    ScanIndexForward:  true,
  }))
  return {
    items:   (result.Items ?? []) as FollowRecord[],
    lastKey: result.LastEvaluatedKey as Record<string, unknown> | undefined,
  }
}

export type ListFollowersByAuthorInput = {
  authorId:  string
  limit?:    number
  lastKey?:  Record<string, unknown>
}

/**
 * Lists all viewers who follow an author via GSI-FollowersByAuthor.
 * Used by notifications-lambda for fan-out.
 */
export const listFollowersByAuthor = async (
  client: DynamoDBDocumentClient,
  input: ListFollowersByAuthorInput
): Promise<ListFollowsResult> => {
  const limit = Math.min(input.limit ?? 100, 500)
  const result = await client.send(new QueryCommand({
    TableName:                 TABLE_NAME,
    IndexName:                 'GSI-FollowersByAuthor',
    KeyConditionExpression:    'authorId = :authorId',
    ExpressionAttributeValues: { ':authorId': input.authorId },
    ExclusiveStartKey:         input.lastKey,
    Limit:                     limit,
    ScanIndexForward:          true,
  }))
  return {
    items:   (result.Items ?? []) as FollowRecord[],
    lastKey: result.LastEvaluatedKey as Record<string, unknown> | undefined,
  }
}
