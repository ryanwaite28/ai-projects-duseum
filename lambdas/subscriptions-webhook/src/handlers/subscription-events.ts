// =============================================================================
// lambdas/subscriptions-webhook/src/handlers/subscription-events.ts
// Handles customer.subscription.* Stripe events — FR-SUB-03, CLAUDE.md rules
//
// userId resolution: event.data.object.metadata.userId (set via
// subscription_data.metadata in the Checkout Session — see create-*-checkout.ts)
// targetId: 'PLATFORM' when type='PLATFORM', else metadata.authorId
// =============================================================================

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import type { Subscription } from '@duseum/shared'
import {
  adjustAuthorSubscriberCount,
  getFullAuthorSubscription,
  getUserAccount,
  getViewerProfile,
  getAuthorProfile,
  upsertSubscription,
  sendPlatformSubStartedEmail,
  sendPlatformSubCanceledEmail,
  sendAuthorSubStartedViewerEmail,
  sendAuthorSubCanceledViewerEmail,
  sendAuthorSubStartedAuthorEmail,
  sendAuthorSubCanceledAuthorEmail,
  sendPlatformNewSubscriberEmail,
} from '@duseum/shared'
import { logger } from './logger.js'

const BASE_URL = process.env['APP_BASE_URL'] ?? 'https://duseum.com'
const ADMIN_EMAIL = process.env['SES_ADMIN_ADDRESS'] ?? 'admin@duseum.com'

// In Stripe API version 2026-03-25.dahlia, current_period_end moved from the
// subscription root into each items.data[] entry. The top-level field no longer exists.
type StripeSubscription = {
  id: string
  customer: string
  status: string
  items: {
    data: Array<{ current_period_end: number | null }>
  }
  metadata: Record<string, string>
}

// Stripe subscription status → Duseum Subscription status
const toStatus = (stripeStatus: string): Subscription['status'] => {
  switch (stripeStatus) {
    case 'active':             return 'ACTIVE'
    case 'past_due':           return 'PAST_DUE'
    case 'canceled':
    case 'incomplete_expired': return 'CANCELLED'
    case 'incomplete':         return 'INCOMPLETE'
    case 'paused':             return 'PAUSED'
    default:                   return 'INCOMPLETE'
  }
}

const resolveIds = (
  sub: StripeSubscription
): { userId: string; targetId: string } | null => {
  const { userId, type, authorId } = sub.metadata ?? {}
  if (!userId) {
    logger.warn('Subscription event missing userId in metadata', {
      stripeSubscriptionId: sub.id,
    })
    return null
  }
  const targetId = type === 'PLATFORM' ? 'PLATFORM' : (authorId ?? '')
  if (!targetId) {
    logger.warn('Subscription event missing authorId for AUTHOR_SUB', {
      stripeSubscriptionId: sub.id,
    })
    return null
  }
  return { userId, targetId }
}

const buildRecord = (
  sub: StripeSubscription,
  status: Subscription['status']
): (Subscription & { userId: string; targetId: string }) | null => {
  const ids = resolveIds(sub)
  if (!ids) return null
  return {
    ...ids,
    stripeSubscriptionId: sub.id,
    stripeCustomerId: typeof sub.customer === 'string' ? sub.customer : '',
    status,
    currentPeriodEnd: (() => {
      const ts = sub.items?.data?.[0]?.current_period_end ?? null
      return ts != null ? new Date(ts * 1000).toISOString() : null
    })(),
    createdAt: new Date().toISOString(),
  }
}

export const handleSubscriptionCreated = async (
  client: DynamoDBDocumentClient,
  sub: StripeSubscription
): Promise<void> => {
  const record = buildRecord(sub, 'ACTIVE')
  if (!record) return
  await upsertSubscription(client, record)
  // Increment author subscriber count for new ACTIVE author subscriptions
  if (record.targetId !== 'PLATFORM') {
    await adjustAuthorSubscriberCount(client, record.targetId, 1)
  }

  // Fire-and-forget transactional emails
  void (async () => {
    try {
      const [viewerAccount, viewerProfile] = await Promise.all([
        getUserAccount(client, record.userId),
        getViewerProfile(client, record.userId),
      ])
      if (!viewerAccount?.email) return
      const viewerEmail = viewerAccount.email
      const viewerName = viewerProfile?.displayName ?? viewerEmail

      if (record.targetId === 'PLATFORM') {
        await Promise.all([
          sendPlatformSubStartedEmail(viewerEmail, {
            displayName: viewerName,
            currentPeriodEnd: record.currentPeriodEnd ?? '',
            browseUrl: `${BASE_URL}/browse`,
            manageUrl: `${BASE_URL}/settings`,
          }),
          sendPlatformNewSubscriberEmail(ADMIN_EMAIL, {
            userId: record.userId,
            currentPeriodEnd: record.currentPeriodEnd ?? undefined,
          }),
        ])
      } else {
        const [authorAccount, authorProfile] = await Promise.all([
          getUserAccount(client, record.targetId),
          getAuthorProfile(client, record.targetId),
        ])
        const authorName = authorProfile?.displayName ?? record.targetId
        await Promise.all([
          sendAuthorSubStartedViewerEmail(viewerEmail, {
            viewerDisplayName: viewerName,
            authorDisplayName: authorName,
            authorUrl: `${BASE_URL}/authors/${record.targetId}`,
            currentPeriodEnd: record.currentPeriodEnd ?? '',
            manageUrl: `${BASE_URL}/settings`,
          }),
          ...(authorAccount?.email
            ? [sendAuthorSubStartedAuthorEmail(authorAccount.email, {
                authorDisplayName: authorName,
                dashboardUrl: `${BASE_URL}/dashboard`,
              })]
            : []),
        ])
      }
    } catch (err) {
      logger.error('Failed to send subscription started emails', { userId: record.userId, err })
    }
  })()
}

export const handleSubscriptionUpdated = async (
  client: DynamoDBDocumentClient,
  sub: StripeSubscription
): Promise<void> => {
  const newStatus = toStatus(sub.status)
  const record = buildRecord(sub, newStatus)
  if (!record) return

  // Read old status before overwriting so we can adjust the counter correctly
  let oldStatus: Subscription['status'] | undefined
  if (record.targetId !== 'PLATFORM') {
    const existing = await getFullAuthorSubscription(client, record.userId, record.targetId)
    oldStatus = existing?.status
  }

  await upsertSubscription(client, record)

  if (record.targetId !== 'PLATFORM') {
    const wasActive = oldStatus === 'ACTIVE'
    const isActive  = newStatus === 'ACTIVE'
    if (!wasActive && isActive) {
      await adjustAuthorSubscriberCount(client, record.targetId, 1)
    } else if (wasActive && !isActive) {
      await adjustAuthorSubscriberCount(client, record.targetId, -1)
    }
  }
}

export const handleSubscriptionDeleted = async (
  client: DynamoDBDocumentClient,
  sub: StripeSubscription
): Promise<void> => {
  const record = buildRecord(sub, 'CANCELLED')
  if (!record) return

  // Read old status — only decrement if it was ACTIVE (not already PAUSED)
  let wasActive = false
  if (record.targetId !== 'PLATFORM') {
    const existing = await getFullAuthorSubscription(client, record.userId, record.targetId)
    wasActive = existing?.status === 'ACTIVE'
  }

  await upsertSubscription(client, record)

  if (wasActive) {
    await adjustAuthorSubscriberCount(client, record.targetId, -1)
  }

  // Fire-and-forget transactional emails
  void (async () => {
    try {
      const [viewerAccount, viewerProfile] = await Promise.all([
        getUserAccount(client, record.userId),
        getViewerProfile(client, record.userId),
      ])
      if (!viewerAccount?.email) return
      const viewerEmail = viewerAccount.email
      const viewerName = viewerProfile?.displayName ?? viewerEmail

      if (record.targetId === 'PLATFORM') {
        await sendPlatformSubCanceledEmail(viewerEmail, {
          displayName: viewerName,
          manageUrl: `${BASE_URL}/settings`,
        })
      } else {
        const [authorAccount, authorProfile] = await Promise.all([
          getUserAccount(client, record.targetId),
          getAuthorProfile(client, record.targetId),
        ])
        const authorName = authorProfile?.displayName ?? record.targetId
        await Promise.all([
          sendAuthorSubCanceledViewerEmail(viewerEmail, {
            viewerDisplayName: viewerName,
            authorDisplayName: authorName,
            authorUrl: `${BASE_URL}/authors/${record.targetId}`,
            manageUrl: `${BASE_URL}/settings`,
          }),
          ...(authorAccount?.email
            ? [sendAuthorSubCanceledAuthorEmail(authorAccount.email, {
                authorDisplayName: authorName,
                dashboardUrl: `${BASE_URL}/dashboard`,
              })]
            : []),
        ])
      }
    } catch (err) {
      logger.error('Failed to send subscription canceled emails', { userId: record.userId, err })
    }
  })()
}

export const handleSubscriptionPaused = async (
  client: DynamoDBDocumentClient,
  sub: StripeSubscription
): Promise<void> => {
  const record = buildRecord(sub, 'PAUSED')
  if (!record) return
  await upsertSubscription(client, record)
  // Stripe only sends paused when transitioning from active → paused
  if (record.targetId !== 'PLATFORM') {
    await adjustAuthorSubscriberCount(client, record.targetId, -1)
  }
}

export const handleSubscriptionResumed = async (
  client: DynamoDBDocumentClient,
  sub: StripeSubscription
): Promise<void> => {
  const record = buildRecord(sub, 'ACTIVE')
  if (!record) return
  await upsertSubscription(client, record)
  // Stripe only sends resumed when transitioning from paused → active
  if (record.targetId !== 'PLATFORM') {
    await adjustAuthorSubscriberCount(client, record.targetId, 1)
  }
}
