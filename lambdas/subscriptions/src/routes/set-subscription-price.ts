// =============================================================================
// lambdas/subscriptions/src/routes/set-subscription-price.ts
// POST /users/me/author/subscription-price — FR-AUTH-PROF-05, FR-SUB-07
//
// Sets or clears the Author's monthly subscription price.
//
// Body: { amountUsd: number }
//   amountUsd = 0 → disable subscriptions (clear price ID + monthlyUsd)
//   1 ≤ amountUsd ≤ 50 → create a new Stripe Price on the Connect account
//
// The Author must have a connected Stripe account with charges_enabled = true
// before a price can be set.
// =============================================================================

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  NotFoundError,
  ValidationError,
  createPlatformPrice,
  deactivatePlatformPrice,
  docClient,
  getAuthorProfile,
  ok,
  retrieveConnectAccount,
  updateAuthorProfile,
} from '@duseum/shared'

type Body = { amountUsd: number }

export const setSubscriptionPrice = async (
  event: APIGatewayProxyEventV2,
  context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2> => {
  const { userId } = context

  const body = JSON.parse(event.body ?? '{}') as Body
  const amountUsd = Number(body.amountUsd)

  if (isNaN(amountUsd) || amountUsd < 0 || !Number.isInteger(amountUsd)) {
    throw new ValidationError('amountUsd must be a non-negative integer.')
  }
  if (amountUsd > 50) {
    throw new ValidationError('amountUsd must not exceed 50.')
  }

  const author = await getAuthorProfile(docClient, userId)
  if (!author) throw new NotFoundError('Author profile not found.')

  // Disable path — clear price, no Stripe API call needed
  if (amountUsd === 0) {
    await updateAuthorProfile(docClient, userId, {
      authorSubscriptionPriceId:   null,
      authorSubscriptionMonthlyUsd: null,
    })
    return ok({ priceId: null, monthlyUsd: null })
  }

  if (amountUsd < 1) {
    throw new ValidationError('amountUsd must be at least 1.')
  }

  if (!author.stripeConnectAccountId) {
    throw new ValidationError('Author must connect a Stripe account before setting a price.')
  }

  const account = await retrieveConnectAccount(author.stripeConnectAccountId)
  if (!account.charges_enabled) {
    throw new ValidationError('Stripe Connect account is not fully set up. Complete onboarding first.')
  }

  const oldPriceId = author.authorSubscriptionPriceId ?? null

  // Price must live on the platform account so the platform-account checkout
  // session (transfer_data Destination Charges model) can resolve it.
  const price = await createPlatformPrice({
    unit_amount:  amountUsd * 100,
    currency:     'usd',
    recurring:    { interval: 'month' },
    product_data: { name: `Author Subscription - ${userId}` },
    metadata: { authorId: userId }
  })

  await updateAuthorProfile(docClient, userId, {
    authorSubscriptionPriceId:    price.id,
    authorSubscriptionMonthlyUsd: amountUsd,
  })

  // Deactivate the previous platform price after the profile is updated — fire-and-forget;
  // a failure here does not affect the caller since the new price is already live.
  // Stripe does not support price deletion — deactivation is the functional equivalent.
  if (oldPriceId) {
    void deactivatePlatformPrice(oldPriceId).catch((error) => {
      console.warn(error);
    })
  }

  return ok({ priceId: price.id, monthlyUsd: amountUsd })
}
