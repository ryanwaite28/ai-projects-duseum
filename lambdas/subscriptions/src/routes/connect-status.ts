// =============================================================================
// lambdas/subscriptions/src/routes/connect-status.ts
// GET /subscriptions/connect/status — FR-SUB-07
//
// Returns the Stripe Connect account status for the authenticated Author.
// Frontend polls this after the onboarding redirect to confirm completion.
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

  const account = await retrieveConnectAccount(author.stripeConnectAccountId)

  return ok({
    stripeConnectAccountId: author.stripeConnectAccountId,
    chargesEnabled:   account.charges_enabled,
    detailsSubmitted: account.details_submitted,
  })
}
