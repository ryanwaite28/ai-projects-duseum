// =============================================================================
// lambdas/subscriptions/src/routes/connect-onboard.ts
// POST /subscriptions/connect/onboard — FR-SUB-07, FR-SUB-13
//
// Creates (or reuses) a Stripe Connect Express account for the authenticated
// Author, then generates a one-time account-onboarding link and returns its URL.
// Idempotent: if stripeConnectAccountId already set, skips account creation.
//
// On first creation, also writes a CONNECT#{id}/META reverse-lookup record
// (Section 4.7) so the account.updated webhook handler can resolve userId
// from the Stripe Connect account ID without a GSI or table scan.
// =============================================================================

import { PutCommand } from '@aws-sdk/lib-dynamodb'
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  NotFoundError,
  TABLE_NAME,
  ValidationError,
  createAccountLink,
  createConnectAccount,
  docClient,
  getAuthorProfile,
  ok,
  updateAuthorProfile,
} from '@duseum/shared'

const APP_BASE_URL = process.env.APP_BASE_URL ?? 'https://duseum.com'

export const connectOnboard = async (
  _event: APIGatewayProxyEventV2,
  context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2> => {
  const { userId } = context

  const author = await getAuthorProfile(docClient, userId)
  if (!author) throw new NotFoundError('Author profile not found.')
  if (author.status === 'SUSPENDED' || author.status === 'DEACTIVATED') {
    throw new ValidationError('Author account is not eligible for Connect onboarding.')
  }

  let connectAccountId = author.stripeConnectAccountId

  if (!connectAccountId) {
    const account = await createConnectAccount({ type: 'express', business_type: 'individual' })
    connectAccountId = account.id

    // Write Author record and reverse-lookup record in parallel.
    // The reverse-lookup allows the account.updated webhook handler to resolve
    // userId from the Stripe Connect account ID (Section 4.7, FR-SUB-13).
    await Promise.all([
      updateAuthorProfile(docClient, userId, { stripeConnectAccountId: connectAccountId }),
      docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            PK:        `CONNECT#${connectAccountId}`,
            SK:        'META',
            userId,
            createdAt: new Date().toISOString(),
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        })
      ).catch((err: unknown) => {
        // ConditionalCheckFailedException means the record already exists — safe to ignore
        if (err instanceof Error && err.name === 'ConditionalCheckFailedException') return
        throw err
      }),
    ])
  }

  const link = await createAccountLink({
    account:            connectAccountId,
    type:               'account_onboarding',
    refresh_url:        `${APP_BASE_URL}/dashboard/author?connect=refresh`,
    return_url:         `${APP_BASE_URL}/dashboard/author?connect=return`,
    collection_options: { fields: 'currently_due' },
  })

  return ok({ accountLinkUrl: link.url })
}
