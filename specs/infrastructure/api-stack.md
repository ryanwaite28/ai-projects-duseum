## Spec: API Stack (API Gateway + Lambdas)

**Status**: ✅ Implemented
**FR coverage**: NFR-PERF-03, NFR-SEC-01, NFR-OBS-03
**Relevant PROJECT.md sections**: 4.2, 5, 6.2, 6.3, 13.5

**What this implements**: CDK ApiStack provisioning all Lambda functions, HTTP API Gateway, Cognito JWT authorizer, route registration, IAM roles, X-Ray tracing, environment variable injection.

**Prerequisites**: `storage-stack.md`, `auth-stack.md`, `messaging-stack.md` all deployed; all Lambda source compiled (`turbo run build:lambdas`); `APP_BASE_URL` gap resolved in `commonEnv`

**Done when**:
- [x] `cdk synth --strict --context env=dev` passes with zero warnings
- [x] All 10 Lambda functions created with `duseum-lambda-{name}-role` IAM roles (least-privilege)
- [x] `APP_BASE_URL` present in `commonEnv` — not hardcoded in any route handler
- [x] Cognito JWT authorizer wired to User Pool ARN read from SSM
- [x] SQS event sources attached to `subscriptions-webhook-lambda` and `notifications-lambda`
- [x] X-Ray active tracing enabled on all Lambda functions
- [x] All Lambda + API GW resources tagged `Project=duseum`, `Environment={env}`, `Stack=api`, `ManagedBy=CDK`
- [x] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `infrastructure/stacks/api-stack.ts` — Lambda functions, API GW, authorizers, routes

**Lambda functions**:
| Lambda | Handler | Route prefix | Auth |
|---|---|---|---|
| `duseum-{env}-lambda-artworks` | `artworks/src/index.handler` | `/artworks/*`, `/collections/*`, `/media/*` | JWT (mixed) |
| `duseum-{env}-lambda-users` | `users/src/index.handler` | `/users/*`, `/profiles/*` | JWT (mixed) |
| `duseum-{env}-lambda-subscriptions` | `subscriptions/src/index.handler` | `/subscriptions/*` | JWT |
| `duseum-{env}-lambda-subscriptions-webhook` | `subscriptions-webhook/src/index.handler` | SQS trigger | None |
| `duseum-{env}-lambda-notifications` | `notifications/src/index.handler` | SQS trigger | None |
| `duseum-{env}-lambda-features` | `features/src/index.handler` | `/features/*` | JWT (mixed) |
| `duseum-{env}-lambda-social` | `social/src/index.handler` | `/comments/*`, `/reactions/*` | JWT |
| `duseum-{env}-lambda-admin` | `admin/src/index.handler` | `/admin/*` | JWT (ADMIN group) |
| `duseum-{env}-lambda-maintenance` | `maintenance/src/index.handler` | EventBridge trigger | None |
| `duseum-{env}-lambda-auth-triggers` | `users/src/triggers/index.handler` | Cognito trigger | None |

**Common Lambda env vars** (`commonEnv`):
- `DYNAMODB_TABLE_NAME`, `IDEMPOTENCY_TABLE_NAME`, `CONFIG_TABLE_NAME`
- `S3_MEDIA_BUCKET_NAME`, `CLOUDFRONT_MEDIA_DOMAIN`, `CLOUDFRONT_KEY_PAIR_ID`
- `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`
- `APP_BASE_URL` — `https://duseum.com` (prod) or `https://dev.duseum.com` (dev) — **must be added to fix Stripe Connect redirect URLs**

**Known gap to fix**: `APP_BASE_URL` is currently absent from `commonEnv` — Stripe Connect `return_url`/`refresh_url` fall back to `https://duseum.com` hardcoded in `connect-onboard.ts`.

**IAM roles**: `duseum-lambda-{name}-role` with least-privilege policies (DynamoDB, SQS, SES, S3, Secrets Manager access as needed per Lambda)

**`subscriptions-webhook` IAM additions** (see `specs/notifications/transactional-emails.md`):
- `WebhookSes`: `ses:SendEmail`, `ses:SendRawEmail` on `*`
- `WebhookSesFromSecret`: `secretsmanager:GetSecretValue` on `duseum/{env}/ses/from-address`
- Env var added: `SES_ADMIN_ADDRESS = admin@duseum.com`

**Tags**: all Lambda + API GW resources tagged `Project=duseum`, `Environment={env}`, `Stack=api`, `ManagedBy=CDK`

**Tests to write**:
- CDK unit: correct number of Lambda functions; JWT authorizer wired to User Pool ARN; SQS event source on webhook Lambda; X-Ray tracing enabled
