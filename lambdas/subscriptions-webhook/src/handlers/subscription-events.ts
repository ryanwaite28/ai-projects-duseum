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
import { upsertSubscription } from '@duseum/shared'
import { logger } from './logger.js'

type StripeSubscription = {
  id: string
  customer: string
  status: string
  current_period_end: number
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
    currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
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
}

export const handleSubscriptionUpdated = async (
  client: DynamoDBDocumentClient,
  sub: StripeSubscription
): Promise<void> => {
  const record = buildRecord(sub, toStatus(sub.status))
  if (!record) return
  await upsertSubscription(client, record)
}

export const handleSubscriptionDeleted = async (
  client: DynamoDBDocumentClient,
  sub: StripeSubscription
): Promise<void> => {
  const record = buildRecord(sub, 'CANCELLED')
  if (!record) return
  await upsertSubscription(client, record)
}

export const handleSubscriptionPaused = async (
  client: DynamoDBDocumentClient,
  sub: StripeSubscription
): Promise<void> => {
  const record = buildRecord(sub, 'PAUSED')
  if (!record) return
  await upsertSubscription(client, record)
}

export const handleSubscriptionResumed = async (
  client: DynamoDBDocumentClient,
  sub: StripeSubscription
): Promise<void> => {
  const record = buildRecord(sub, 'ACTIVE')
  if (!record) return
  await upsertSubscription(client, record)
}
