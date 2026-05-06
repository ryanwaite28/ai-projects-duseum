// =============================================================================
// lambdas/subscriptions/src/routes/connect-login-link.ts
// POST /subscriptions/connect/login-link — FR-SUB-14
//
// Generates a one-time Stripe Express Dashboard login link for the authenticated
// Author so they can view income, payouts, and download statements.
// Requires Connect onboarding to be complete (connectChargesEnabled = true).
// =============================================================================

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  NotFoundError,
  ValidationError,
  createConnectLoginLink,
  docClient,
  getAuthorProfile,
  ok,
} from '@duseum/shared'

export const connectLoginLink = async (
  _event: APIGatewayProxyEventV2,
  context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2> => {
  const { userId } = context

  const author = await getAuthorProfile(docClient, userId)
  if (!author) throw new NotFoundError('Author profile not found.')

  if (!author.stripeConnectAccountId) {
    throw new ValidationError('No Stripe Connect account found. Complete onboarding first.')
  }

  if (!author.connectChargesEnabled) {
    throw new ValidationError('Stripe account setup is not complete.')
  }

  const link = await createConnectLoginLink(author.stripeConnectAccountId)

  return ok({ loginUrl: link.url })
}
