// =============================================================================
// packages/shared/src/db/collections.repository.ts
// Repository functions for Collections and Collection Items.
//
// Key design (§4.7):
//   Collection metadata: COLLECTION#{collectionId} | METADATA
//   Collection items:    COLLECTION#{collectionId} | ARTWORK#{zeroPad(order)}#{artworkId}
//   Author-index item:   AUTHOR#{authorId}          | COLLECTION#{createdAt}#{collectionId}
//     → enables querying "all collections by author" via primary key
// =============================================================================

import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import type { Collection, CollectionItem } from '../types/index.js'
import { TABLE_NAME } from './client.js'

// ── Key helpers ───────────────────────────────────────────────────────────────

const collectionKey = (collectionId: string) =>
  ({ PK: `COLLECTION#${collectionId}`, SK: 'METADATA' }) as const

const collectionItemKey = (collectionId: string, order: number, artworkId: string) =>
  ({
    PK: `COLLECTION#${collectionId}`,
    SK: `ARTWORK#${String(order).padStart(8, '0')}#${artworkId}`,
  }) as const

const authorCollectionKey = (authorId: string, createdAt: string, collectionId: string) =>
  ({
    PK: `AUTHOR#${authorId}`,
    SK: `COLLECTION#${createdAt}#${collectionId}`,
  }) as const

// ── Collections ───────────────────────────────────────────────────────────────

export const createCollection = async (
  client: DynamoDBDocumentClient,
  collection: Collection & { ownerId: string }
): Promise<void> => {
  const { collectionId, ownerId, createdAt, visibility, posterS3Key } = collection

  // FREE collections get collectionBrowse='FREE' so GSI-AllFreeCollections can index them (FR-DISC-06/07)
  const browseAttr = visibility === 'FREE' ? { collectionBrowse: 'FREE' } : {}

  await Promise.all([
    client.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          ...collectionKey(collectionId),
          ...collection,
          ...browseAttr,
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      })
    ),
    client.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          ...authorCollectionKey(ownerId, createdAt, collectionId),
          collectionId,
          ownerId,
          title:      collection.title,
          visibility,
          ...(posterS3Key != null ? { posterS3Key } : {}),
          createdAt,
        },
      })
    ),
  ])
}

export const getCollection = async (
  client: DynamoDBDocumentClient,
  collectionId: string
): Promise<Collection | null> => {
  const result = await client.send(
    new GetCommand({ TableName: TABLE_NAME, Key: collectionKey(collectionId) })
  )
  return (result.Item as Collection) ?? null
}

export type ListCollectionsByAuthorOptions = {
  visibilityFilter?: 'FREE' | 'SUBSCRIBER_ONLY'
  limit?: number
  lastKey?: Record<string, unknown>
}

export const listCollectionsByAuthor = async (
  client: DynamoDBDocumentClient,
  authorId: string,
  opts: ListCollectionsByAuthorOptions = {}
): Promise<{ items: Collection[]; lastKey?: Record<string, unknown> }> => {
  const { visibilityFilter, limit = 20, lastKey } = opts

  const result = await client.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      FilterExpression: visibilityFilter ? '#vis = :vis' : undefined,
      ExpressionAttributeNames: visibilityFilter ? { '#vis': 'visibility' } : undefined,
      ExpressionAttributeValues: {
        ':pk': `AUTHOR#${authorId}`,
        ':prefix': 'COLLECTION#',
        ...(visibilityFilter && { ':vis': visibilityFilter }),
      },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: lastKey,
    })
  )

  // Author-index items are stubs; fetch full collection metadata for each
  const stubs = result.Items ?? []
  const collections = await Promise.all(
    stubs.map((stub) =>
      getCollection(client, stub['collectionId'] as string)
    )
  )

  return {
    items: collections.filter(Boolean) as Collection[],
    lastKey: result.LastEvaluatedKey as Record<string, unknown> | undefined,
  }
}

export const updateCollection = async (
  client: DynamoDBDocumentClient,
  collectionId: string,
  patch: { title?: string; description?: string; posterS3Key?: string | null }
): Promise<Collection> => {
  const sets: string[] = ['updatedAt = :updatedAt']
  const values: Record<string, unknown> = { ':updatedAt': new Date().toISOString() }

  if (patch.title !== undefined) { sets.push('title = :title'); values[':title'] = patch.title }
  if (patch.description !== undefined) { sets.push('description = :description'); values[':description'] = patch.description }
  if (patch.posterS3Key !== undefined) { sets.push('posterS3Key = :poster'); values[':poster'] = patch.posterS3Key }

  const result = await client.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: collectionKey(collectionId),
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeValues: values,
      ConditionExpression: 'attribute_exists(PK)',
      ReturnValues: 'ALL_NEW',
    })
  )
  return result.Attributes as Collection
}

export const deleteCollection = async (
  client: DynamoDBDocumentClient,
  collectionId: string,
  ownerId: string,
  createdAt: string
): Promise<void> => {
  const { TransactWriteCommand } = await import('@aws-sdk/lib-dynamodb')
  await client.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Delete: {
            TableName: TABLE_NAME,
            Key: collectionKey(collectionId),
          },
        },
        {
          Delete: {
            TableName: TABLE_NAME,
            Key: authorCollectionKey(ownerId, createdAt, collectionId),
          },
        },
      ],
    })
  )
}

// ── Collection Items ──────────────────────────────────────────────────────────

export const addArtPieceToCollection = async (
  client: DynamoDBDocumentClient,
  item: CollectionItem
): Promise<void> => {
  const { collectionId, artworkId, order, addedAt } = item
  await client.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        ...collectionItemKey(collectionId, order, artworkId),
        collectionId,
        artworkId,
        order,
        addedAt,
      },
    })
  )
}

/**
 * Finds a CollectionItem by artworkId within a collection.
 * Queries all items for the collection and filters in-memory — acceptable for
 * small collections (<100 items).
 */
export const getCollectionItemByArtworkId = async (
  client: DynamoDBDocumentClient,
  collectionId: string,
  artworkId: string
): Promise<CollectionItem | null> => {
  const result = await client.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      FilterExpression: 'artworkId = :artworkId',
      ExpressionAttributeValues: {
        ':pk':       `COLLECTION#${collectionId}`,
        ':prefix':   'ARTWORK#',
        ':artworkId': artworkId,
      },
    })
  )
  const item = (result.Items ?? [])[0]
  return item ? (item as CollectionItem) : null
}

export const removeArtPieceFromCollection = async (
  client: DynamoDBDocumentClient,
  collectionId: string,
  artworkId: string,
  order: number
): Promise<void> => {
  const { DeleteCommand } = await import('@aws-sdk/lib-dynamodb')
  await client.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: collectionItemKey(collectionId, order, artworkId),
    })
  )
}

export const listCollectionItems = async (
  client: DynamoDBDocumentClient,
  collectionId: string,
  limit = 50,
  lastKey?: Record<string, unknown>
): Promise<{ items: CollectionItem[]; lastKey?: Record<string, unknown> }> => {
  const result = await client.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: {
        ':pk': `COLLECTION#${collectionId}`,
        ':prefix': 'ARTWORK#',
      },
      ScanIndexForward: true, // order ascending
      Limit: limit,
      ExclusiveStartKey: lastKey,
    })
  )
  return {
    items: (result.Items ?? []) as CollectionItem[],
    lastKey: result.LastEvaluatedKey as Record<string, unknown> | undefined,
  }
}

export const countCollectionItems = async (
  client: DynamoDBDocumentClient,
  collectionId: string
): Promise<number> => {
  const result = await client.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: {
        ':pk': `COLLECTION#${collectionId}`,
        ':prefix': 'ARTWORK#',
      },
      Select: 'COUNT',
    })
  )
  return result.Count ?? 0
}

export const getFirstCollectionItem = async (
  client: DynamoDBDocumentClient,
  collectionId: string
): Promise<CollectionItem | null> => {
  const result = await client.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: {
        ':pk': `COLLECTION#${collectionId}`,
        ':prefix': 'ARTWORK#',
      },
      ScanIndexForward: true,
      Limit: 1,
    })
  )
  const item = (result.Items ?? [])[0]
  return item ? (item as CollectionItem) : null
}

// ── Browse: all FREE collections via GSI-AllFreeCollections (FR-DISC-06/07) ──

export type ListFreeCollectionsOptions = {
  limit?: number
  lastKey?: Record<string, unknown>
}

export const listFreeCollections = async (
  client: DynamoDBDocumentClient,
  opts: ListFreeCollectionsOptions = {}
): Promise<{ items: Collection[]; lastKey?: Record<string, unknown> }> => {
  const { limit = 20, lastKey } = opts

  const result = await client.send(
    new QueryCommand({
      TableName:              TABLE_NAME,
      IndexName:              'GSI-AllFreeCollections',
      KeyConditionExpression: 'collectionBrowse = :browse',
      ExpressionAttributeValues: { ':browse': 'FREE' },
      ScanIndexForward: false, // newest first
      Limit: limit,
      ExclusiveStartKey: lastKey,
    })
  )

  return {
    items:   (result.Items ?? []) as Collection[],
    lastKey: result.LastEvaluatedKey as Record<string, unknown> | undefined,
  }
}
