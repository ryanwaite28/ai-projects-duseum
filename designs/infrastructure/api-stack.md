## Design: API Stack (API Gateway + Lambdas)

**Spec**: `specs/infrastructure/api-stack.md`
**Status**: 🔒 Implemented
**Approved**: 2026-04-25
**Last updated**: 2026-04-25

---

### TypeScript Interfaces

```typescript
// infrastructure/stacks/api-stack.ts
export interface ApiStackProps extends cdk.StackProps {
  readonly envName: string
}

export class ApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ApiStackProps)
}
```

### DynamoDB Record Shapes

N/A — ApiStack provisions Lambda functions and API Gateway; no DynamoDB records.

### Function Signatures

N/A — CDK stack.

### CDK Construct Patterns

```typescript
// HTTP API Gateway v2 with CORS
const httpApi = new apigatewayv2.CfnApi(this, 'HttpApi', {
  name: `duseum-${envName}-apigw`,
  protocolType: 'HTTP',
  corsConfiguration: { allowOrigins: envName === 'prod' ? ['https://duseum.com', 'https://www.duseum.com'] : ['*'], ... },
})

// Cognito JWT Authorizer
const jwtAuthorizer = new apigatewayv2.CfnAuthorizer(this, 'CognitoAuthorizer', {
  authorizerType: 'JWT',
  identitySource: ['$request.header.Authorization'],
  jwtConfiguration: { audience: [userPoolClientId], issuer: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}` },
})

// WAF WebACL — REGIONAL scope, attached to API GW $default stage
// Rules: AWSManagedRulesCommonRuleSet (p1), AWSManagedRulesKnownBadInputs (p2),
//        ApiRateLimit 1000req/5min (p3), UploadRateLimit 30req/5min on /media/upload-intent (p4)

// Lambda functions — all using DuseumLambdaFunction construct
// media-lambda, artworks-lambda, users-lambda, subscriptions-lambda, stripe-ingress-lambda,
// subscriptions-webhook-lambda (SQS trigger), notifications-lambda (SQS trigger),
// features-lambda, social-lambda, admin-lambda, maintenance-lambda (EventBridge trigger)

// EventBridge rules (in ApiStack, not MessagingStack)
new events.Rule(this, 'DailyFeatureRule', {
  ruleName: `duseum-${envName}-eventbridge-daily-featured-author`,
  schedule: events.Schedule.cron({ minute: '0', hour: '0' }),
  targets: [new targets.LambdaFunction(maintenanceLambda.fn)],
})
new events.Rule(this, 'WeeklyRotationRule', {
  ruleName: `duseum-${envName}-eventbridge-weekly-feature-rotation`,
  schedule: events.Schedule.cron({ minute: '0', hour: '0', weekDay: 'MON' }),
  targets: [new targets.LambdaFunction(maintenanceLambda.fn)],
})

// SQS event sources
subsWebhookLambda.fn.addEventSource(new lambdaEventSources.SqsEventSource(stripeWebhookQueue, { batchSize: 1 }))
notificationsLambda.fn.addEventSource(new lambdaEventSources.SqsEventSource(notificationQueue, { batchSize: 1 }))

// SSM outputs under /duseum/{env}/stacks/api/
// api_gateway_url | api_gateway_id | {name}_lambda_arn for all 10 lambdas
```

**Lambda function inventory** (actual):

| Lambda | Handler entry | Auth | Route prefix |
|---|---|---|---|
| `media` | `lambdas/media/src/index.ts` | JWT | `POST /media/upload-intent` |
| `artworks` | `lambdas/artworks/src/index.ts` | Mixed | `/artworks/*`, `/collections/*`, `/authors/*/collections` |
| `users` | `lambdas/users/src/index.ts` | Mixed | `/users/*`, `/authors/*`, `/follows/*`, `/notifications/*` |
| `subscriptions` | `lambdas/subscriptions/src/index.ts` | JWT | `/subscriptions/*`, `/users/me/author/subscription-price` |
| `stripe-ingress` | `lambdas/subscriptions-webhook/src/ingress.ts` | NONE | `POST /webhooks/stripe` |
| `subscriptions-webhook` | `lambdas/subscriptions-webhook/src/index.ts` | SQS trigger | — |
| `notifications` | `lambdas/notifications/src/index.ts` | SQS trigger | — |
| `features` | `lambdas/features/src/index.ts` | Mixed | `/features/*` |
| `social` | `lambdas/social/src/index.ts` | JWT | `/artworks/*/comments`, `/comments/*`, `/reactions/*`, `/follows/*`, `/users/me/notification-preferences`, `/notifications/unsubscribe` |
| `admin` | `lambdas/admin/src/index.ts` | JWT | `ANY /admin/{proxy+}` |
| `maintenance` | `lambdas/maintenance/src/index.ts` | EventBridge | — |

**Common env vars** (`commonEnv`):
`DYNAMODB_TABLE_NAME`, `IDEMPOTENCY_TABLE_NAME`, `CONFIG_TABLE_NAME`, `S3_MEDIA_BUCKET_NAME`, `CLOUDFRONT_MEDIA_DOMAIN`, `CLOUDFRONT_KEY_PAIR_ID`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`

Note: `APP_BASE_URL` is NOT in `commonEnv` — it is set per-route in handlers via `process.env.APP_BASE_URL ?? 'https://duseum.com'` fallback.

### Implementation Steps

1. All cross-stack values read from SSM via `valueForStringParameter()` (deploy-time tokens).
2. `commonEnv` map assembled from SSM tokens.
3. `mainTableCrudPolicy` IAM statement reused across all Lambdas that need main table access.
4. HTTP API v2 created with CORS (restrictive in prod, permissive in dev).
5. Cognito JWT authorizer created using User Pool Client ID and issuer URL.
6. WAF WebACL created (REGIONAL scope for API GW); associated with `$default` stage.
7. `stripe-ingress-lambda` created as a thin validator → SQS enqueue Lambda; registered on `POST /webhooks/stripe` (NONE auth).
8. `subscriptions-webhook-lambda` created with SQS event source (batchSize: 1) on stripe webhook queue.
9. `notifications-lambda` created with SQS event source (batchSize: 1) on notification queue.
10. `maintenance-lambda` created with 5-minute timeout; two EventBridge rules created in same stack (daily + weekly schedule).
11. API Gateway integration + route helpers (`makeIntegration`, `route`) reduce boilerplate.
12. SSM outputs: API GW URL, API GW ID, + Lambda ARN for each of 10 functions.
13. Stack-level tags applied.

### Integration Test Fixtures

No integration tests for ApiStack CDK construct. `cdk synth --strict --context env=dev` validated in CI pipeline (both `ci.yml` jobs: `cdk-synth-dev` and `cdk-synth-prod`).

### Decisions & Constraints

- EventBridge rules placed in ApiStack (not MessagingStack) because CDK's `fromEventRuleArn()` returns `IRule` which lacks `addTarget()` — rules must be created in the same stack as their target Lambda.
- `stripe-ingress-lambda` is a separate Lambda from `subscriptions-webhook-lambda` — validates Stripe signature synchronously, enqueues to SQS, returns 200 immediately. This keeps the webhook endpoint responsive (<3s) even under SQS backpressure.
- `batchSize: 1` on both SQS event sources — one message per Lambda invocation; simplifies partial batch failure handling and idempotency.
- WAF rate limits: 1000 req/5min general, 30 req/5min on `/media/upload-intent` (prevents presigned URL abuse).
- Route auth is mixed per Lambda — some routes (e.g., `GET /artworks/{id}`) use `NONE` auth (optional JWT handled in Lambda), others use `JWT` auth enforced at API GW level.
- `APP_BASE_URL` missing from `commonEnv` — route handlers fall back to hardcoded `'https://duseum.com'`. This is a known gap documented in the spec; fix requires adding to `commonEnv`.
- `maintenance-lambda` has `timeout: cdk.Duration.seconds(300)` — 5 minutes to accommodate daily/weekly batch processing.
