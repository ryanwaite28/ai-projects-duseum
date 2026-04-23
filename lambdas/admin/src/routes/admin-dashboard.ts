// GET /admin/dashboard — aggregate admin stats.
// FR-ADMIN-06: total users, active subs, MRR, DLQ depths, upcoming weekly features.
//
// External calls: Cognito DescribeUserPool, SQS GetQueueAttributes.
// Sub/MRR counts read from config table (maintained by subscriptions-webhook-lambda).
// Signups 7d/30d read from config table (maintained by post-confirm Lambda trigger).

import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  TABLE_NAME,
  docClient,
  getConfigNumber,
  getCurrentIsoWeek,
  ok,
} from '@duseum/shared'
import { cognitoDescribeUserPool } from '../cognito.js'
import { getDlqDepth } from '../sqs.js'

type BookingItem = { isoWeek: string; featureStatus: string }

export const adminDashboard = async (
  _event: APIGatewayProxyEventV2,
  _context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2> => {
  const currentWeek = getCurrentIsoWeek()

  const [
    { estimatedNumberOfUsers },
    activePlatformSubs,
    activeAuthorSubs,
    platformMrrCents,
    newSignups7d,
    newSignups30d,
    stripeWebhookDepth,
    notificationsDepth,
    confirmedItems,
    activeItems,
  ] = await Promise.all([
    cognitoDescribeUserPool(),
    getConfigNumber(docClient, 'ACTIVE_PLATFORM_SUB_COUNT', 0),
    getConfigNumber(docClient, 'ACTIVE_AUTHOR_SUB_COUNT', 0),
    getConfigNumber(docClient, 'PLATFORM_MRR_USD_CENTS', 0),
    getConfigNumber(docClient, 'NEW_SIGNUPS_7D', -1),
    getConfigNumber(docClient, 'NEW_SIGNUPS_30D', -1),
    getDlqDepth(process.env.STRIPE_WEBHOOK_DLQ_URL),
    getDlqDepth(process.env.NOTIFICATION_DLQ_URL),
    // CONFIRMED bookings from current week onward
    docClient.send(new QueryCommand({
      TableName:                 TABLE_NAME,
      IndexName:                 'GSI-WeeklyFeatureByStatus',
      KeyConditionExpression:    'featureStatus = :s AND isoWeek >= :week',
      ExpressionAttributeValues: { ':s': 'CONFIRMED', ':week': currentWeek },
    })).then((r) => (r.Items ?? []) as BookingItem[]),
    // ACTIVE bookings (only current week)
    docClient.send(new QueryCommand({
      TableName:                 TABLE_NAME,
      IndexName:                 'GSI-WeeklyFeatureByStatus',
      KeyConditionExpression:    'featureStatus = :s AND isoWeek = :week',
      ExpressionAttributeValues: { ':s': 'ACTIVE', ':week': currentWeek },
    })).then((r) => (r.Items ?? []) as BookingItem[]),
  ])

  // Group by isoWeek
  const weekMap = new Map<string, { confirmedCount: number; activeCount: number }>()
  for (const b of confirmedItems) {
    const entry = weekMap.get(b.isoWeek) ?? { confirmedCount: 0, activeCount: 0 }
    entry.confirmedCount++
    weekMap.set(b.isoWeek, entry)
  }
  for (const b of activeItems) {
    const entry = weekMap.get(b.isoWeek) ?? { confirmedCount: 0, activeCount: 0 }
    entry.activeCount++
    weekMap.set(b.isoWeek, entry)
  }
  const upcomingFeatureBookings = Array.from(weekMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([isoWeek, counts]) => ({ isoWeek, ...counts }))

  return ok({
    totalUsers:            estimatedNumberOfUsers,
    activePlatformSubs,
    activeAuthorSubs,
    platformMrrUsd:        platformMrrCents / 100,
    newSignups7d:          newSignups7d  >= 0 ? newSignups7d  : null,
    newSignups30d:         newSignups30d >= 0 ? newSignups30d : null,
    dlqDepths: {
      stripeWebhook:       stripeWebhookDepth,
      notifications:       notificationsDepth,
    },
    upcomingFeatureBookings,
  })
}
