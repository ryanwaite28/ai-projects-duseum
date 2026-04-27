// =============================================================================
// scripts/dev-server.ts
// Local Lambda HTTP server — Section 16.3
//
// Routes HTTP requests to Lambda handler modules as APIGatewayProxyEventV2
// events.  Run via:   npm run dev:lambdas   (tsx watch for hot-reload)
//
// Requires MiniStack running at localhost:4566 (docker-compose up -d).
// Auth is stubbed: cognitoAuthMiddleware reads X-Dev-User-Id header when
// ENVIRONMENT=local — no Cognito JWT required.
// =============================================================================

import 'dotenv/config'   // loads .env.local (or .env) before anything else

import express, { type Request, type Response } from 'express'
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
  Handler,
} from 'aws-lambda'

// ── Ensure critical local env vars are set ────────────────────────────────────

process.env['AWS_ENDPOINT_URL']       ??= 'http://localhost:4566'
process.env['AWS_REGION']             ??= 'us-east-1'
process.env['AWS_ACCESS_KEY_ID']      ??= 'test'
process.env['AWS_SECRET_ACCESS_KEY']  ??= 'test'
process.env['ENVIRONMENT']            ??= 'local'
process.env['DYNAMODB_TABLE_NAME']    ??= 'duseum-local'
process.env['IDEMPOTENCY_TABLE_NAME'] ??= 'duseum-local-idempotency'
process.env['CONFIG_TABLE_NAME']      ??= 'duseum-local-config'
process.env['S3_MEDIA_BUCKET']        ??= 'duseum-local-media'
process.env['CLOUDFRONT_MEDIA_DOMAIN'] ??= 'localhost:4566'
process.env['CLOUDFRONT_KEY_PAIR_ID'] ??= 'local-stub'
process.env['COGNITO_USER_POOL_ID']   ??= 'local-stub'
process.env['COGNITO_CLIENT_ID']      ??= 'local-stub'
process.env['STRIPE_WEBHOOK_QUEUE_URL'] ??= 'http://localhost:4566/000000000000/duseum-local-stripe-webhooks'
process.env['NOTIFICATIONS_QUEUE_URL'] ??= 'http://localhost:4566/000000000000/duseum-local-notifications'
process.env['SES_FROM_EMAIL']         ??= 'no-reply@duseum.com'
process.env['UNSUBSCRIBE_HMAC_SECRET'] ??= 'local-dev-unsubscribe-hmac-secret'
process.env['DAILY_FEATURE_RULE_NAME'] ??= 'duseum-local-daily-featured-author'
process.env['WEEKLY_ROTATION_RULE_NAME'] ??= 'duseum-local-weekly-feature-rotation'

// ── Handler registry ──────────────────────────────────────────────────────────
// Dynamic imports so the server starts even when Lambda modules are not yet
// implemented.  Each entry is { handler } once loaded, or null if the module
// does not exist yet.

type LambdaHandler = Handler<APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2>

interface HandlerEntry {
  handler: LambdaHandler | null
  name: string
}

async function tryImport(modulePath: string, name: string): Promise<HandlerEntry> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = await import(modulePath) as Record<string, any>
    if (typeof mod['handler'] !== 'function') {
      console.warn(`[dev-server] ${name}: module loaded but 'handler' export is not a function`)
      return { handler: null, name }
    }
    console.log(`[dev-server] ${name}: handler loaded`)
    return { handler: mod['handler'] as LambdaHandler, name }
  } catch {
    console.warn(`[dev-server] ${name}: handler not yet implemented — will return 501`)
    return { handler: null, name }
  }
}

// ── Request → APIGatewayProxyEventV2 ──────────────────────────────────────────

function toApiGwEvent(req: Request): APIGatewayProxyEventV2 {
  const rawQueryString = Object.entries(req.query)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')

  // Lowercase all header names (HTTP/2 convention; Lambda runtime does the same)
  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== undefined) {
      headers[key.toLowerCase()] = Array.isArray(value) ? value.join(',') : value
    }
  }

  // Body — Express raw() gives us a Buffer; convert to string if present
  const rawBody = req.body
  let body: string | undefined
  if (Buffer.isBuffer(rawBody) && rawBody.length > 0) {
    body = rawBody.toString('utf-8')
  } else if (typeof rawBody === 'string' && rawBody.length > 0) {
    body = rawBody
  }

  const now = Date.now()

  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: req.path,
    rawQueryString,
    headers,
    cookies: (headers['cookie'] ?? '').split(';').map(c => c.trim()).filter(Boolean),
    queryStringParameters: req.query as Record<string, string>,
    pathParameters: {},
    stageVariables: {},
    body,
    isBase64Encoded: false,
    requestContext: {
      accountId: '000000000000',
      apiId: 'local',
      domainName: `localhost:${PORT}`,
      domainPrefix: 'localhost',
      http: {
        method: req.method,
        path: req.path,
        protocol: 'HTTP/1.1',
        sourceIp: req.ip ?? '127.0.0.1',
        userAgent: req.headers['user-agent'] ?? '',
      },
      requestId: `local-${now}-${Math.random().toString(36).slice(2, 8)}`,
      routeKey: '$default',
      stage: '$default',
      time: new Date(now).toISOString(),
      timeEpoch: now,
    },
  }
}

// ── Lambda result → Express response ─────────────────────────────────────────

function fromLambdaResult(
  result: APIGatewayProxyStructuredResultV2 | void | null | undefined,
  res: Response,
): void {
  if (result == null) {
    res.status(204).end()
    return
  }

  const statusCode = result.statusCode ?? 200
  const headers    = result.headers ?? {}
  const body       = result.body ?? ''

  for (const [k, v] of Object.entries(headers)) {
    res.setHeader(k, String(v))
  }
  if (!headers['content-type']) {
    res.setHeader('Content-Type', 'application/json')
  }

  if (result.isBase64Encoded) {
    res.status(statusCode).send(Buffer.from(body, 'base64'))
  } else {
    res.status(statusCode).send(body)
  }
}

// ── Not-yet-implemented stub ──────────────────────────────────────────────────

function notImplemented(name: string, res: Response): void {
  res.status(501).json({
    error: 'NOT_IMPLEMENTED',
    message: `Lambda '${name}' is not yet implemented.`,
  })
}

// ── Invoke helper ─────────────────────────────────────────────────────────────

async function invokeLambda(
  entry: HandlerEntry,
  req: Request,
  res: Response,
): Promise<void> {
  if (!entry.handler) {
    notImplemented(entry.name, res)
    return
  }

  const event = toApiGwEvent(req)

  try {
    const result = await (entry.handler as (
      event: APIGatewayProxyEventV2,
      context: never,
      callback: never,
    ) => Promise<APIGatewayProxyStructuredResultV2>)(event, {} as never, undefined as never)
    fromLambdaResult(result, res)
  } catch (err) {
    console.error(`[dev-server] ${entry.name} unhandled error:`, err)
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Unhandled Lambda error' })
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

const PORT = 3001

async function main(): Promise<void> {
  // Load all handlers concurrently (non-blocking even if modules are absent).
  // HTTP-facing lambdas export `handler` from their index.ts entry point.
  // subscriptions-webhook uses ingress.ts as the HTTP entry point (index.ts is
  // the SQS consumer — not reachable via HTTP in local dev).
  const [
    artworks,
    users,
    subscriptions,
    subscriptionsWebhook,
    social,
    admin,
    media,
    features,
  ] = await Promise.all([
    tryImport('../lambdas/artworks/src/index.js',              'artworks-lambda'),
    tryImport('../lambdas/users/src/index.js',                 'users-lambda'),
    tryImport('../lambdas/subscriptions/src/index.js',         'subscriptions-lambda'),
    tryImport('../lambdas/subscriptions-webhook/src/ingress.js','subscriptions-webhook-lambda'),
    tryImport('../lambdas/social/src/index.js',                'social-lambda'),
    tryImport('../lambdas/admin/src/index.js',                 'admin-lambda'),
    tryImport('../lambdas/media/src/index.js',                 'media-lambda'),
    tryImport('../lambdas/features/src/index.js',              'features-lambda'),
  ])

  const app = express()

  // Parse all bodies as raw Buffer — handlers decode as needed
  app.use(express.raw({ type: '*/*', limit: '25mb' }))

  // ── Route table (order matters — more-specific first) ────────────────────────
  // Express 5 / path-to-regexp v8: use {/*rest} for optional rest segments.
  //
  // Routing mirrors the API Gateway integration map from §4.2:
  //   - social-lambda owns /artworks/:id/comments and /artworks/:id/reactions
  //     → must be registered before the generic /artworks catch-all
  //   - subscriptions-lambda owns POST /users/me/author/subscription-price
  //     → registered before the /users catch-all
  //   - /collections and /authors/:id/collections belong to artworks-lambda (§4.2)
  //   - /authors, /follows, /notifications belong to users-lambda
  //   - subscriptions-webhook ingress receives raw Stripe HTTP POST locally;
  //     in production this is an API GW → SQS direct integration (no Lambda)

  // Stripe webhook ingress (HTTP) — must be exact before any prefix catch-alls
  app.all('/webhooks/stripe',                  (req, res) => invokeLambda(subscriptionsWebhook, req, res))

  // social-lambda: comment + reaction sub-routes nested under /artworks
  app.all('/artworks/:artworkId/comments',     (req, res) => invokeLambda(social,               req, res))
  app.all('/artworks/:artworkId/reactions',    (req, res) => invokeLambda(social,               req, res))

  // social-lambda: top-level comment deletion
  app.all('/comments{/*rest}',                 (req, res) => invokeLambda(social,               req, res))

  // subscriptions-lambda: cross-domain route that lives under /users path
  app.post('/users/me/author/subscription-price', (req, res) => invokeLambda(subscriptions,     req, res))

  // artworks-lambda: artwork CRUD + collections
  app.all('/artworks{/*rest}',                 (req, res) => invokeLambda(artworks,             req, res))
  app.all('/collections{/*rest}',              (req, res) => invokeLambda(artworks,             req, res))

  // artworks-lambda: /authors/:id/collections (artworks owns collection entity)
  app.get('/authors/:authorId/collections',    (req, res) => invokeLambda(artworks,             req, res))

  // users-lambda: remaining /authors, /users, /follows, /notifications
  app.all('/authors{/*rest}',                  (req, res) => invokeLambda(users,                req, res))
  app.all('/users{/*rest}',                    (req, res) => invokeLambda(users,                req, res))
  app.all('/follows{/*rest}',                  (req, res) => invokeLambda(users,                req, res))
  app.all('/notifications{/*rest}',            (req, res) => invokeLambda(users,                req, res))

  // subscriptions-lambda
  app.all('/subscriptions{/*rest}',            (req, res) => invokeLambda(subscriptions,        req, res))

  // admin, media, features
  app.all('/admin{/*rest}',                    (req, res) => invokeLambda(admin,                req, res))
  app.all('/media{/*rest}',                    (req, res) => invokeLambda(media,                req, res))
  app.all('/features{/*rest}',                 (req, res) => invokeLambda(features,             req, res))

  app.listen(PORT, () => {
    console.log(`\n[dev-server] Local Lambda server running at http://localhost:${PORT}`)
    console.log('[dev-server] MiniStack endpoint:', process.env['AWS_ENDPOINT_URL'])
    console.log('[dev-server] ENVIRONMENT:', process.env['ENVIRONMENT'])
    console.log('[dev-server] Auth stub active — pass X-Dev-User-Id header as userId\n')
  })
}

main().catch(err => {
  console.error('[dev-server] Fatal startup error:', err)
  process.exit(1)
})
