// =============================================================================
// packages/shared/src/db/authors.repository.ts
// Repository functions for Author directory listing and public gallery.
//
// Key design (§4.7):
//   AuthorProfile  PK=USER#{userId}  SK=PROFILE#AUTHOR
//   GSI-AuthorDirectory: PK=profileType('AUTHOR') SK=createdAt
//   GSI-AuthorPublic:    PK=authorId              SK=visibility#createdAt
// =============================================================================

import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import type { ArtPiece, AuthorProfile } from '../types/index.js'
import { TABLE_NAME } from './client.js'

export type ListAuthorsOptions = {
  sort?: 'newest' | 'subscriberCount'
  limit?: number
  lastKey?: Record<string, unknown>
}

export type ListAuthorsResult = {
  items: AuthorProfile[]
  lastKey?: Record<string, unknown>
}

/**
 * Lists ACTIVE Author profiles using GSI-AuthorDirectory (PK=profileType, SK=createdAt).
 * For sort=newest: DynamoDB ordering is used directly (ScanIndexForward=false).
 * For sort=subscriberCount: same query, in-memory sort on the returned page.
 */
export const listAuthors = async (
  client: DynamoDBDocumentClient,
  opts: ListAuthorsOptions = {}
): Promise<ListAuthorsResult> => {
  const { sort = 'newest', limit = 20, lastKey } = opts

  const result = await client.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI-AuthorDirectory',
      KeyConditionExpression: 'profileType = :pt',
      FilterExpression: '#s = :active',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':pt': 'AUTHOR', ':active': 'ACTIVE' },
      ScanIndexForward: false, // newest first by default
      Limit: limit,
      ExclusiveStartKey: lastKey,
    })
  )

  let items = (result.Items ?? []) as AuthorProfile[]

  if (sort === 'subscriberCount') {
    items = items.slice().sort((a, b) => (b.subscriberCount ?? 0) - (a.subscriberCount ?? 0))
  }

  return { items, lastKey: result.LastEvaluatedKey as Record<string, unknown> | undefined }
}

/**
 * Pages through ALL ACTIVE Authors using GSI-AuthorDirectory.
 * Used by maintenance-lambda for daily featured author selection — reads every
 * author regardless of creation order. Accepts up to `maxItems` (default 5000)
 * to guard against unbounded scans on very large tables.
 */
export const listAllActiveAuthors = async (
  client: DynamoDBDocumentClient,
  maxItems = 5_000
): Promise<AuthorProfile[]> => {
  const results: AuthorProfile[] = []
  let lastKey: Record<string, unknown> | undefined

  do {
    const page = await client.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI-AuthorDirectory',
        KeyConditionExpression: 'profileType = :pt',
        FilterExpression: '#s = :active',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':pt': 'AUTHOR', ':active': 'ACTIVE' },
        ExclusiveStartKey: lastKey,
        Limit: 100,
      })
    )
    results.push(...((page.Items ?? []) as AuthorProfile[]))
    lastKey = page.LastEvaluatedKey as Record<string, unknown> | undefined
  } while (lastKey && results.length < maxItems)

  return results
}

/**
 * Returns true if the given Author has at least one PUBLIC published art piece.
 */
export const authorHasPublicPiece = async (
  client: DynamoDBDocumentClient,
  authorId: string
): Promise<boolean> => {
  const result = await client.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI-AuthorPublic',
      KeyConditionExpression: 'authorId = :authorId AND #vca BETWEEN :low AND :high',
      ExpressionAttributeNames: { '#vca': 'visibility#createdAt' },
      ExpressionAttributeValues: {
        ':authorId': authorId,
        ':low':  'PUBLIC#',
        ':high': 'PUBLIC#~',
      },
      Limit: 1,
      Select: 'COUNT',
    })
  )
  return (result.Count ?? 0) > 0
}

export type GetAuthorPublicGalleryResult = {
  items: ArtPiece[]
  lastKey?: Record<string, unknown>
}

/**
 * Returns up to `limit` public art pieces for an Author, newest first.
 * Uses GSI-AuthorPublic (PK=authorId, SK=visibility#createdAt BETWEEN 'PUBLIC#' and 'PUBLIC#~').
 */
export const getAuthorPublicGallery = async (
  client: DynamoDBDocumentClient,
  authorId: string,
  limit = 12,
  lastKey?: Record<string, unknown>
): Promise<GetAuthorPublicGalleryResult> => {
  const result = await client.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI-AuthorPublic',
      KeyConditionExpression:
        'authorId = :authorId AND #vca BETWEEN :low AND :high',
      ExpressionAttributeNames: { '#vca': 'visibility#createdAt' },
      ExpressionAttributeValues: {
        ':authorId': authorId,
        ':low': 'PUBLIC#',
        ':high': 'PUBLIC#~',
      },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: lastKey,
    })
  )

  return {
    items: (result.Items ?? []) as ArtPiece[],
    lastKey: result.LastEvaluatedKey as Record<string, unknown> | undefined,
  }
}
