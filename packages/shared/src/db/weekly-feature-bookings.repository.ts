// =============================================================================
// packages/shared/src/db/weekly-feature-bookings.repository.ts
// Repository for WeeklyFeatureBooking records — Section 4.7, 2.11
//
// Key design (§4.7):
//   Primary key (by week):   PK=FEATURE#WEEK#{isoWeek}  SK=AUTHOR#{authorId}
//   Secondary access (by author): PK=AUTHOR#{authorId}  SK=FEATURE#WEEK#{isoWeek}
//   GSI-WeeklyFeatureByStatus: PK=featureStatus          SK=isoWeek
// =============================================================================

import {
  ConditionalCheckFailedException,
} from '@aws-sdk/client-dynamodb'
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import type { WeeklyFeatureBooking } from '../types/index.js'
import { TABLE_NAME } from './client.js'

// ── Pointer record key helper ─────────────────────────────────────────────────

const bookingPointerKey = (bookingId: string) =>
  ({ PK: `BOOKING#${bookingId}`, SK: 'METADATA' }) as const

// ── Key helpers ───────────────────────────────────────────────────────────────

const weekKey = (isoWeek: string, authorId: string) =>
  ({ PK: `FEATURE#WEEK#${isoWeek}`, SK: `AUTHOR#${authorId}` }) as const

const authorKey = (authorId: string, isoWeek: string) =>
  ({ PK: `AUTHOR#${authorId}`, SK: `FEATURE#WEEK#${isoWeek}` }) as const

// ── Reads ─────────────────────────────────────────────────────────────────────

export const getBooking = async (
  client: DynamoDBDocumentClient,
  isoWeek: string,
  authorId: string
): Promise<WeeklyFeatureBooking | null> => {
  const result = await client.send(
    new GetCommand({ TableName: TABLE_NAME, Key: weekKey(isoWeek, authorId) })
  )
  return (result.Item as WeeklyFeatureBooking) ?? null
}

export const listBookingsByWeek = async (
  client: DynamoDBDocumentClient,
  isoWeek: string
): Promise<WeeklyFeatureBooking[]> => {
  const result = await client.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: {
        ':pk':     `FEATURE#WEEK#${isoWeek}`,
        ':prefix': 'AUTHOR#',
      },
    })
  )
  return (result.Items ?? []) as WeeklyFeatureBooking[]
}

export const countActiveBookingsForWeek = async (
  client: DynamoDBDocumentClient,
  isoWeek: string
): Promise<number> => {
  // FilterExpression restricts to primary booking items (PK=FEATURE#WEEK#…).
  // Both the forward item and the AUTHOR# reverse-lookup item carry featureStatus
  // + isoWeek, so without this filter the GSI would double-count each booking.
  const result = await client.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI-WeeklyFeatureByStatus',
      KeyConditionExpression: 'featureStatus = :status AND isoWeek = :week',
      FilterExpression:       'begins_with(PK, :pkPrefix)',
      ExpressionAttributeValues: {
        ':status':   'CONFIRMED',
        ':week':     isoWeek,
        ':pkPrefix': 'FEATURE#WEEK#',
      },
      Select: 'COUNT',
    })
  )
  return result.Count ?? 0
}

export const getRecentBookingsByAuthor = async (
  client: DynamoDBDocumentClient,
  authorId: string,
  limit = 10
): Promise<WeeklyFeatureBooking[]> => {
  const result = await client.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: {
        ':pk':     `AUTHOR#${authorId}`,
        ':prefix': 'FEATURE#WEEK#',
      },
      ScanIndexForward: false, // newest isoWeek first (lexicographic desc)
      Limit: limit,
    })
  )
  return (result.Items ?? []) as WeeklyFeatureBooking[]
}

// ── Writes ────────────────────────────────────────────────────────────────────

export const createBooking = async (
  client: DynamoDBDocumentClient,
  booking: WeeklyFeatureBooking
): Promise<void> => {
  const item = {
    ...weekKey(booking.isoWeek, booking.authorId),
    ...booking,
    // GSI-WeeklyFeatureByStatus attributes
    featureStatus: booking.featureStatus,
    isoWeek: booking.isoWeek,
  }

  // Author-keyed copy for eligibility lookups
  const authorItem = {
    ...authorKey(booking.authorId, booking.isoWeek),
    ...booking,
    featureStatus: booking.featureStatus,
    isoWeek: booking.isoWeek,
  }

  // Thin pointer record: BOOKING#{bookingId} / METADATA — enables O(1) admin lookup by bookingId
  const pointerItem = {
    ...bookingPointerKey(booking.bookingId),
    bookingId: booking.bookingId,
    isoWeek:   booking.isoWeek,
    authorId:  booking.authorId,
  }

  await Promise.all([
    client.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
      ConditionExpression: 'attribute_not_exists(PK)',
    })),
    client.send(new PutCommand({ TableName: TABLE_NAME, Item: authorItem })),
    client.send(new PutCommand({ TableName: TABLE_NAME, Item: pointerItem })),
  ])
}

/**
 * Looks up a booking by its bookingId using the BOOKING#{bookingId} pointer record,
 * then fetches the full booking by week+author keys. Returns null if not found.
 */
export const getBookingByBookingId = async (
  client: DynamoDBDocumentClient,
  bookingId: string
): Promise<WeeklyFeatureBooking | null> => {
  const pointerResult = await client.send(
    new GetCommand({ TableName: TABLE_NAME, Key: bookingPointerKey(bookingId) })
  )
  if (!pointerResult.Item) return null

  const { isoWeek, authorId } = pointerResult.Item as { isoWeek: string; authorId: string }
  return getBooking(client, isoWeek, authorId)
}

export const updateBookingStatus = async (
  client: DynamoDBDocumentClient,
  isoWeek: string,
  authorId: string,
  status: WeeklyFeatureBooking['featureStatus'],
  extra: Partial<Pick<WeeklyFeatureBooking, 'activatedAt' | 'cancelledAt' | 'cancelledBy' | 'cancellationReason'>> = {}
): Promise<void> => {
  const expressionParts = ['featureStatus = :s']
  const values: Record<string, unknown> = { ':s': status }

  if (extra.activatedAt !== undefined) {
    expressionParts.push('activatedAt = :activatedAt')
    values[':activatedAt'] = extra.activatedAt
  }
  if (extra.cancelledAt !== undefined) {
    expressionParts.push('cancelledAt = :cancelledAt')
    values[':cancelledAt'] = extra.cancelledAt
  }
  if (extra.cancelledBy !== undefined) {
    expressionParts.push('cancelledBy = :cancelledBy')
    values[':cancelledBy'] = extra.cancelledBy
  }
  if (extra.cancellationReason !== undefined) {
    expressionParts.push('cancellationReason = :cancellationReason')
    values[':cancellationReason'] = extra.cancellationReason
  }

  const updateExpr = `SET ${expressionParts.join(', ')}`

  await Promise.all([
    // Update week-keyed record
    client.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: weekKey(isoWeek, authorId),
      UpdateExpression: updateExpr,
      ExpressionAttributeValues: values,
    })),
    // Update author-keyed record (for history queries)
    client.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: authorKey(authorId, isoWeek),
      UpdateExpression: updateExpr,
      ExpressionAttributeValues: values,
    })),
  ])
}

/**
 * Lists all bookings for a given week and featureStatus using GSI-WeeklyFeatureByStatus.
 * Used by features-lambda to get ACTIVE bookings for the weekly display, and by
 * maintenance-lambda to get CONFIRMED bookings to activate on Monday rotation.
 */
export const listBookingsByStatusAndWeek = async (
  client: DynamoDBDocumentClient,
  featureStatus: WeeklyFeatureBooking['featureStatus'],
  isoWeek: string
): Promise<WeeklyFeatureBooking[]> => {
  const result = await client.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI-WeeklyFeatureByStatus',
      KeyConditionExpression: 'featureStatus = :status AND isoWeek = :week',
      ExpressionAttributeValues: {
        ':status': featureStatus,
        ':week':   isoWeek,
      },
    })
  )
  return (result.Items ?? []) as WeeklyFeatureBooking[]
}

export { ConditionalCheckFailedException }
