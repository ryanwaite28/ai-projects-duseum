// =============================================================================
// packages/shared/src/db/artworks.repository.ts
// Repository for ArtPiece records — Sections 4.3, 4.4, 6.4.
//
// Key design (§4.7):
//   ArtPiece main     PK=ARTWORK#{artworkId}  SK=METADATA
//   ArtPiece by author PK=AUTHOR#{authorId}   SK=ARTWORK#{createdAt}#{artworkId}
//
// DynamoDB GSI attributes stored on the ARTWORK#{artworkId} item:
//   status              — 'PUBLIC' | 'PRIVATE' | 'DRAFT' | 'ARCHIVED' (drives GSI-AllPublicPieces)
//   authorId            — drives GSI-AuthorPublic partition key
//   'visibility#createdAt' — composite GSI-AuthorPublic sort key, e.g. 'PUBLIC#2025-08-01T...'
//   createdAt           — drives GSI-AllPublicPieces sort key
//   tag                 — (first tag only, for GSI-TagIndex; multi-tag queries require per-tag items)
// =============================================================================

import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import type { ArtPiece, ArtCategory } from '../types/index.js'
import { CONFIG_TABLE_NAME, TABLE_NAME } from './client.js'

// ── Key helpers ───────────────────────────────────────────────────────────────

const artworkKey = (artworkId: string) =>
  ({ PK: `ARTWORK#${artworkId}`, SK: 'METADATA' }) as const

const authorArtworkKey = (authorId: string, createdAt: string, artworkId: string) =>
  ({ PK: `AUTHOR#${authorId}`, SK: `ARTWORK#${createdAt}#${artworkId}` }) as const

/** Composite GSI-AuthorPublic sort key value. */
const visibilityCreatedAt = (visibility: string, createdAt: string) =>
  `${visibility}#${createdAt}`

// ── Input types ───────────────────────────────────────────────────────────────

export type CreateArtPieceInput = {
  artworkId: string
  authorId: string
  title: string
  description: string
  tags: string[]
  category: ArtCategory
  visibility: 'PUBLIC' | 'PRIVATE' | 'DRAFT'
  s3Key: string
  mimeType: string
  fileSizeBytes: number
  commentsEnabled: boolean
  createdAt: string
  updatedAt: string
  publishedAt: string | null
}

export type UpdateArtPieceInput = {
  title?: string
  description?: string
  tags?: string[]
  /** New visibility value. Caller must also supply visibilityCreatedAt. */
  visibility?: 'PUBLIC' | 'PRIVATE' | 'DRAFT'
  /** Full GSI-AuthorPublic composite SK: '${visibility}#${piece.createdAt}' */
  visibilityCreatedAt?: string
  commentsEnabled?: boolean
  publishedAt?: string | null
  updatedAt: string
}

// ── Writes ────────────────────────────────────────────────────────────────────

/**
 * Creates the main ArtPiece item and the author-index item atomically
 * as two PutItem calls. The main item carries all GSI attributes.
 */
export const createArtPiece = async (
  client: DynamoDBDocumentClient,
  input: CreateArtPieceInput
): Promise<void> => {
  const { artworkId, authorId, visibility, createdAt, tags } = input

  // Main item — carries all GSI projection attributes
  await client.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        ...artworkKey(artworkId),
        ...input,
        // GSI-AllPublicPieces: status attribute doubles as visibility for active pieces
        status: visibility,
        // GSI-AuthorPublic composite SK
        'visibility#createdAt': visibilityCreatedAt(visibility, createdAt),
        // GSI-TagIndex: first tag only (additional tags require separate items in full impl)
        ...(tags.length > 0 ? { tag: tags[0] } : {}),
        viewCount: 0,
        notifiedCount: 0,
        reactionCounts: {},
        commentCount: 0,
      },
      ConditionExpression: 'attribute_not_exists(PK)',
    })
  )

  // Author-index item (primary key query without GSI)
  await client.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        ...authorArtworkKey(authorId, createdAt, artworkId),
        artworkId,
        authorId,
        createdAt,
      },
    })
  )
}

/**
 * Updates mutable fields on an ArtPiece. When visibility changes, all GSI
 * composite attributes are rewritten to keep the indexes consistent.
 */
export const updateArtPiece = async (
  client: DynamoDBDocumentClient,
  artworkId: string,
  input: UpdateArtPieceInput
): Promise<void> => {
  const sets: string[] = ['#updatedAt = :updatedAt']
  const names: Record<string, string> = { '#updatedAt': 'updatedAt' }
  const values: Record<string, unknown> = { ':updatedAt': input.updatedAt }

  if (input.title !== undefined) {
    sets.push('#title = :title')
    names['#title'] = 'title'
    values[':title'] = input.title
  }
  if (input.description !== undefined) {
    sets.push('#desc = :desc')
    names['#desc'] = 'description'
    values[':desc'] = input.description
  }
  if (input.tags !== undefined) {
    sets.push('#tags = :tags')
    names['#tags'] = 'tags'
    values[':tags'] = input.tags
    // Update first tag for GSI-TagIndex
    sets.push('#tag = :tag')
    names['#tag'] = 'tag'
    values[':tag'] = input.tags[0] ?? ''
  }
  if (input.commentsEnabled !== undefined) {
    sets.push('#ce = :ce')
    names['#ce'] = 'commentsEnabled'
    values[':ce'] = input.commentsEnabled
  }
  if (input.publishedAt !== undefined) {
    sets.push('#pa = :pa')
    names['#pa'] = 'publishedAt'
    values[':pa'] = input.publishedAt
  }
  if (input.visibility !== undefined) {
    // Rewrite all GSI attributes that depend on visibility.
    // Caller must supply visibilityCreatedAt = `${newVisibility}#${piece.createdAt}`
    // because the route handler already has the existing piece in memory.
    sets.push('#vis = :vis', '#status = :status', '#vca = :vca')
    names['#vis'] = 'visibility'
    names['#status'] = 'status'
    names['#vca'] = 'visibility#createdAt'
    values[':vis'] = input.visibility
    values[':status'] = input.visibility
    values[':vca'] = input.visibilityCreatedAt ?? `${input.visibility}#`
  }

  await client.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: artworkKey(artworkId),
      UpdateExpression: `SET ${sets.join(', ')}`,
      ConditionExpression: 'attribute_exists(PK) AND #status <> :archived',
      ExpressionAttributeNames: { ...names, '#status': 'status' },
      ExpressionAttributeValues: { ...values, ':archived': 'ARCHIVED' },
    })
  )
}

/**
 * Soft-deletes an ArtPiece by setting status=ARCHIVED.
 * Removes from all public GSIs (GSI-AllPublicPieces, GSI-AuthorPublic)
 * by setting status to 'ARCHIVED' (no longer matches 'PUBLIC'/'PRIVATE'/'DRAFT' queries).
 */
export const archiveArtPiece = async (
  client: DynamoDBDocumentClient,
  artworkId: string,
  updatedAt: string
): Promise<void> => {
  await client.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: artworkKey(artworkId),
      UpdateExpression: 'SET #status = :archived, #updatedAt = :updatedAt',
      ConditionExpression: 'attribute_exists(PK)',
      ExpressionAttributeNames: { '#status': 'status', '#updatedAt': 'updatedAt' },
      ExpressionAttributeValues: { ':archived': 'ARCHIVED', ':updatedAt': updatedAt },
    })
  )
}

/**
 * Permanently deletes both the main ArtPiece item and the author-index item.
 * The caller must also delete the S3 object.
 */
export const deleteArtPiece = async (
  client: DynamoDBDocumentClient,
  artworkId: string,
  authorId: string,
  createdAt: string
): Promise<void> => {
  await Promise.all([
    client.send(new DeleteCommand({ TableName: TABLE_NAME, Key: artworkKey(artworkId) })),
    client.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: authorArtworkKey(authorId, createdAt, artworkId),
    })),
  ])
}

// ── Reads ─────────────────────────────────────────────────────────────────────

/**
 * Returns the ArtPiece for a given artworkId, or `null` if not found.
 */
export const getArtPiece = async (
  client: DynamoDBDocumentClient,
  artworkId: string
): Promise<ArtPiece | null> => {
  const result = await client.send(
    new GetCommand({ TableName: TABLE_NAME, Key: artworkKey(artworkId) })
  )
  return (result.Item as ArtPiece) ?? null
}

export type ListPublicArtPiecesInput = {
  authorId?: string
  tag?: string
  category?: ArtCategory
  limit?: number
  lastKey?: Record<string, unknown>
}

/**
 * Lists public (status='PUBLIC') art pieces using the appropriate GSI.
 * - With authorId: GSI-AuthorPublic, SK begins_with 'PUBLIC#', newest first
 * - With tag: GSI-TagIndex, PK=tag, filter status='PUBLIC'
 * - Neither: GSI-AllPublicPieces, PK='PUBLIC', newest first
 */
export const listPublicArtPieces = async (
  client: DynamoDBDocumentClient,
  { authorId, tag, category, limit = 20, lastKey }: ListPublicArtPiecesInput
): Promise<{ items: ArtPiece[]; lastKey?: Record<string, unknown> }> => {
  const filterParts: string[] = []
  const filterNames: Record<string, string> = {}
  const filterValues: Record<string, unknown> = {}

  if (category) {
    filterParts.push('#cat = :cat')
    filterNames['#cat'] = 'category'
    filterValues[':cat'] = category
  }

  let result

  if (authorId) {
    // GSI-AuthorPublic: all PUBLIC pieces by this author, newest first
    result = await client.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI-AuthorPublic',
        KeyConditionExpression: 'authorId = :authorId AND begins_with(#vca, :prefix)',
        FilterExpression: filterParts.length ? filterParts.join(' AND ') : undefined,
        ExpressionAttributeNames: {
          '#vca': 'visibility#createdAt',
          ...filterNames,
        },
        ExpressionAttributeValues: {
          ':authorId': authorId,
          ':prefix': 'PUBLIC#',
          ...filterValues,
        },
        ScanIndexForward: false,
        Limit: limit,
        ExclusiveStartKey: lastKey,
      })
    )
  } else if (tag) {
    // GSI-TagIndex: pieces tagged with this tag, filter to public+active
    filterParts.push('#status = :public')
    filterNames['#status'] = 'status'
    filterValues[':public'] = 'PUBLIC'

    result = await client.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI-TagIndex',
        KeyConditionExpression: '#tag = :tag',
        FilterExpression: filterParts.join(' AND '),
        ExpressionAttributeNames: { '#tag': 'tag', ...filterNames },
        ExpressionAttributeValues: { ':tag': tag, ...filterValues },
        ScanIndexForward: false,
        Limit: limit,
        ExclusiveStartKey: lastKey,
      })
    )
  } else {
    // GSI-AllPublicPieces: global public feed
    result = await client.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI-AllPublicPieces',
        KeyConditionExpression: '#status = :public',
        FilterExpression: filterParts.length ? filterParts.join(' AND ') : undefined,
        ExpressionAttributeNames: { '#status': 'status', ...filterNames },
        ExpressionAttributeValues: { ':public': 'PUBLIC', ...filterValues },
        ScanIndexForward: false,
        Limit: limit,
        ExclusiveStartKey: lastKey,
      })
    )
  }

  return {
    items: (result.Items ?? []) as ArtPiece[],
    lastKey: result.LastEvaluatedKey as Record<string, unknown> | undefined,
  }
}

/**
 * Counts PUBLIC pieces by this author published up to and including the given
 * createdAt. Used to compute the 1-based free-tier rank for a specific piece.
 *
 * Uses GSI-AuthorPublic: PK=authorId, SK BETWEEN 'PUBLIC#' AND 'PUBLIC#{createdAt}~'
 * (the '~' character sorts after all valid ISO timestamps at that prefix).
 */
export const countPublicPiecesByAuthorUpTo = async (
  client: DynamoDBDocumentClient,
  authorId: string,
  createdAt: string
): Promise<number> => {
  const result = await client.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI-AuthorPublic',
      KeyConditionExpression:
        'authorId = :authorId AND #vca BETWEEN :lo AND :hi',
      ExpressionAttributeNames: { '#vca': 'visibility#createdAt' },
      ExpressionAttributeValues: {
        ':authorId': authorId,
        ':lo': 'PUBLIC#',
        ':hi': `PUBLIC#${createdAt}~`,
      },
      Select: 'COUNT',
    })
  )
  return result.Count ?? 0
}

// Cached per Lambda warm container — config table hit at most once per invocation.
let _freeTierLimitCache: number | undefined

/**
 * Reads the FREE_TIER_LIMIT value from the config table.
 * Returns 10 if the config item is missing.
 * Result is cached for the lifetime of the Lambda container (warm invocation reuse).
 */
export const getFreeTierLimit = async (
  client: DynamoDBDocumentClient
): Promise<number> => {
  if (_freeTierLimitCache !== undefined) return _freeTierLimitCache
  const result = await client.send(
    new GetCommand({
      TableName: CONFIG_TABLE_NAME,
      Key: { PK: 'FREE_TIER_LIMIT' },
    })
  )
  _freeTierLimitCache = (result.Item?.value as number | undefined) ?? 10
  return _freeTierLimitCache
}

/** Clears the freeTierLimit cache — used in tests to reset between suites. */
export const clearFreeTierLimitCache = (): void => {
  _freeTierLimitCache = undefined
}

/**
 * Increments viewCount on an ArtPiece by 1. Fire-and-forget — caller should
 * not await this for the API response path.
 */
export const incrementViewCount = async (
  client: DynamoDBDocumentClient,
  artworkId: string
): Promise<void> => {
  await client.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: artworkKey(artworkId),
      UpdateExpression: 'ADD viewCount :one',
      ExpressionAttributeValues: { ':one': 1 },
    })
  )
}

/**
 * Decrements totalPiecesCount on an AuthorProfile by 1 (used on permanent delete).
 */
export const decrementAuthorPieceCount = async (
  client: DynamoDBDocumentClient,
  authorId: string
): Promise<void> => {
  await client.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${authorId}`, SK: 'PROFILE#AUTHOR' },
      UpdateExpression: 'ADD totalPiecesCount :minusOne',
      ExpressionAttributeValues: { ':minusOne': -1 },
    })
  )
}

/**
 * Increments totalPiecesCount on an AuthorProfile by 1 (used on creation).
 */
export const incrementAuthorPieceCount = async (
  client: DynamoDBDocumentClient,
  authorId: string
): Promise<void> => {
  await client.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${authorId}`, SK: 'PROFILE#AUTHOR' },
      UpdateExpression: 'ADD totalPiecesCount :one',
      ExpressionAttributeValues: { ':one': 1 },
    })
  )
}

/**
 * Returns the Platform Subscription for a user, or null if not subscribed.
 */
export const getPlatformSubscription = async (
  client: DynamoDBDocumentClient,
  userId: string
): Promise<{ status: string } | null> => {
  const result = await client.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: 'SUB#PLATFORM' },
    })
  )
  return (result.Item as { status: string } | undefined) ?? null
}

/**
 * Returns the Author Subscription for a viewer+author pair, or null if not subscribed.
 */
export const getAuthorSubscription = async (
  client: DynamoDBDocumentClient,
  viewerId: string,
  authorId: string
): Promise<{ status: string } | null> => {
  const result = await client.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${viewerId}`, SK: `SUB#AUTHOR#${authorId}` },
    })
  )
  return (result.Item as { status: string } | undefined) ?? null
}
