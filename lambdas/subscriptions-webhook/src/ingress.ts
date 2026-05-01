// =============================================================================
// lambdas/subscriptions-webhook/src/ingress.ts
// POST /webhooks/stripe — Section 4.5
//
// Thin HTTP→SQS bridge. Receives the raw Stripe POST, checks that
// Stripe-Signature and body are present, then enqueues
//   { rawBody, stripeSignature }
// to the SQS webhook queue and returns 200 immediately.
//
// Cryptographic signature verification is intentionally deferred to the SQS
// consumer (index.ts) which holds both signing secrets and the idempotency
// table. This handler never reads Secrets Manager.
// =============================================================================

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda'
import { sendMessage } from '@duseum/shared'

const QUEUE_URL = process.env.STRIPE_WEBHOOK_QUEUE_URL ?? ''

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const rawBody = event.body
  if (!rawBody) {
    return { statusCode: 400, body: JSON.stringify({ message: 'Missing request body.' }) }
  }

  const stripeSignature =
    event.headers['stripe-signature'] ?? event.headers['Stripe-Signature']
  if (!stripeSignature) {
    return { statusCode: 400, body: JSON.stringify({ message: 'Missing Stripe-Signature header.' }) }
  }

  await sendMessage(QUEUE_URL, { rawBody, stripeSignature })

  return { statusCode: 200, body: JSON.stringify({ received: true }) }
}
