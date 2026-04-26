// =============================================================================
// lambdas/admin/src/routes/list-bookings.ts
// GET /admin/features/weekly — Section 8.10
//
// List weekly feature bookings with optional filters.
// Query params: week (ISO week), status, limit (1-100, default 50), cursor
//
// Access patterns (no full-table scans):
//   week + status  → GSI-WeeklyFeatureByStatus (featureStatus=status, isoWeek=week)
//   status only    → GSI-WeeklyFeatureByStatus (featureStatus=status, all weeks)
//   week only      → Primary key  PK=FEATURE#WEEK#{isoWeek}
//   neither        → Primary key  PK=FEATURE#WEEK#{currentIsoWeek}
//
// Cursor is a base64-encoded JSON LastEvaluatedKey from DynamoDB.
// =============================================================================

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import {
  ValidationError,
  docClient,
  getCurrentIsoWeek,
  ok,
} from '@duseum/shared'
import type { DuseumContext, WeeklyFeatureBooking } from '@duseum/shared'

const TABLE     = process.env.DYNAMODB_TABLE_NAME!
const MAX_LIMIT = 100
const DEF_LIMIT = 50

const VALID_STATUSES = new Set(['PENDING_PAYMENT', 'CONFIRMED', 'ACTIVE', 'ARCHIVED', 'CANCELLED'])

const encodeCursor = (key: Record<string, unknown>): string =>
  Buffer.from(JSON.stringify(key)).toString('base64')

const decodeCursor = (cursor: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(cursor, 'base64').toString('utf8')) as Record<string, unknown>

export const listBookings = async (
  event: APIGatewayProxyEventV2,
  _context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2> => {
  const qs     = event.queryStringParameters ?? {}
  const week   = qs['week']
  const status = qs['status']
  const rawLimit = parseInt(qs['limit'] ?? String(DEF_LIMIT), 10)
  const cursor   = qs['cursor']

  const limit = Math.min(Math.max(1, isNaN(rawLimit) ? DEF_LIMIT : rawLimit), MAX_LIMIT)

  if (status && !VALID_STATUSES.has(status)) {
    throw new ValidationError(`Invalid status value: ${status}`)
  }

  const exclusiveStartKey = cursor ? decodeCursor(cursor) : undefined

  let items: WeeklyFeatureBooking[]
  let lastEvaluatedKey: Record<string, unknown> | undefined

  if (status) {
    // GSI-WeeklyFeatureByStatus — can filter to exact week or all weeks.
    // FilterExpression excludes the reverse-lookup items (PK=AUTHOR#...) that
    // also carry featureStatus/isoWeek but are not the canonical booking records.
    const result = await docClient.send(new QueryCommand({
      TableName: TABLE,
      IndexName: 'GSI-WeeklyFeatureByStatus',
      KeyConditionExpression: week
        ? 'featureStatus = :status AND isoWeek = :week'
        : 'featureStatus = :status',
      FilterExpression: 'begins_with(PK, :pkPrefix)',
      ExpressionAttributeValues: week
        ? { ':status': status, ':week': week, ':pkPrefix': 'FEATURE#WEEK#' }
        : { ':status': status, ':pkPrefix': 'FEATURE#WEEK#' },
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    }))
    items            = (result.Items ?? []) as WeeklyFeatureBooking[]
    lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined
  } else {
    // Primary key query — week defaults to current week
    const targetWeek = week ?? getCurrentIsoWeek()
    const result = await docClient.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: {
        ':pk':     `FEATURE#WEEK#${targetWeek}`,
        ':prefix': 'AUTHOR#',
      },
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    }))
    items            = (result.Items ?? []) as WeeklyFeatureBooking[]
    lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined
  }

  const nextCursor = lastEvaluatedKey ? encodeCursor(lastEvaluatedKey) : null

  return ok({ bookings: items, nextCursor })
}
