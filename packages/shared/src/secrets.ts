// =============================================================================
// packages/shared/src/secrets.ts
// Secrets Manager getters with module-level cache — Section 10.3
//
// Secrets are ALWAYS read from Secrets Manager at Lambda cold start.
// Never injected as environment variables in deployed environments.
// Module-level cache avoids repeated API calls on warm invocations.
// =============================================================================

import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager'

const sm = new SecretsManagerClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
  // MiniStack endpoint override for local dev
  ...(process.env.AWS_ENDPOINT_URL
    ? { endpoint: process.env.AWS_ENDPOINT_URL }
    : {}),
})

const ENV = process.env.ENVIRONMENT ?? 'local'

const get = async (secretId: string): Promise<string> => {
  const result = await sm.send(new GetSecretValueCommand({ SecretId: secretId }))
  if (!result.SecretString) throw new Error(`Secret ${secretId} has no SecretString`)
  return result.SecretString
}

// ── Stripe ────────────────────────────────────────────────────────────────────

let _stripeKey: string | undefined
export const getStripeKey = async (): Promise<string> => {
  if (_stripeKey) return _stripeKey
  _stripeKey = await get(`duseum/${ENV}/stripe/secret-key`)
  return _stripeKey
}

let _stripeWebhookSecret: string | undefined
export const getStripeWebhookSecret = async (): Promise<string> => {
  if (_stripeWebhookSecret) return _stripeWebhookSecret
  _stripeWebhookSecret = await get(`duseum/${ENV}/stripe/webhook-secret`)
  return _stripeWebhookSecret
}

// ── CloudFront signed URLs ────────────────────────────────────────────────────

let _cloudfrontPrivateKey: string | undefined
export const getCloudfrontPrivateKey = async (): Promise<string> => {
  // Allow integration tests to inject a key without hitting Secrets Manager
  if (process.env.__TEST_CLOUDFRONT_PRIVATE_KEY__) {
    return process.env.__TEST_CLOUDFRONT_PRIVATE_KEY__
  }
  if (_cloudfrontPrivateKey) return _cloudfrontPrivateKey
  _cloudfrontPrivateKey = await get(`duseum/${ENV}/cloudfront/private-key`)
  return _cloudfrontPrivateKey
}

// ── Stripe Connect ────────────────────────────────────────────────────────────

let _stripeConnectClientId: string | undefined
export const getStripeConnectClientId = async (): Promise<string> => {
  if (_stripeConnectClientId) return _stripeConnectClientId
  _stripeConnectClientId = await get(`duseum/${ENV}/stripe/connect-client-id`)
  return _stripeConnectClientId
}

// ── Notifications ─────────────────────────────────────────────────────────────

let _unsubscribeSecret: string | undefined
export const getUnsubscribeSecret = async (): Promise<string> => {
  if (_unsubscribeSecret) return _unsubscribeSecret
  _unsubscribeSecret = await get(`duseum/${ENV}/notifications/unsubscribe-secret`)
  return _unsubscribeSecret
}

let _sesFromAddress: string | undefined
export const getSesFromAddress = async (): Promise<string> => {
  if (_sesFromAddress) return _sesFromAddress
  _sesFromAddress = await get(`duseum/${ENV}/ses/from-address`)
  return _sesFromAddress
}
