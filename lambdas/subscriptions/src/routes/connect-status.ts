// =============================================================================
// lambdas/subscriptions/src/routes/connect-status.ts
// GET /subscriptions/connect/status — FR-SUB-07, FR-SUB-13
//
// Returns the Stripe Connect account status for the authenticated Author.
// Reads connectChargesEnabled from DynamoDB first (cached by the account.updated
// webhook handler — FR-SUB-13). Falls back to a live Stripe API call only when
// the cached value is absent, then backfills it for future requests.
// =============================================================================

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  NotFoundError,
  ValidationError,
  docClient,
  getAuthorProfile,
  ok,
  retrieveConnectAccount,
  updateAuthorProfile,
} from '@duseum/shared'

export const connectStatus = async (
  _event: APIGatewayProxyEventV2,
  context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2> => {
  const { userId } = context

  const author = await getAuthorProfile(docClient, userId)
  if (!author) throw new NotFoundError('Author profile not found.')

  if (!author.stripeConnectAccountId) {
    throw new ValidationError('No Stripe Connect account associated with this Author.')
  }

  // Prefer the DynamoDB-cached value written by the account.updated webhook (FR-SUB-13)
  if (author.connectChargesEnabled !== null && author.connectChargesEnabled !== undefined) {
    return ok({
      stripeConnectAccountId: author.stripeConnectAccountId,
      chargesEnabled:         author.connectChargesEnabled,
      detailsSubmitted:       author.connectChargesEnabled,
    })
  }

  // Cache miss — call Stripe and backfill so the next request hits DynamoDB
  const account = await retrieveConnectAccount(author.stripeConnectAccountId)

  updateAuthorProfile(docClient, userId, {
    connectChargesEnabled: account.charges_enabled,
  }).catch(() => { /* non-critical backfill — next request will retry */ })

  return ok({
    stripeConnectAccountId: author.stripeConnectAccountId,
    chargesEnabled:         account.charges_enabled,
    detailsSubmitted:       account.details_submitted,
  })
}
