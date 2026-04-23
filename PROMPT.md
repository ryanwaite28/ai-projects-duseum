# Duseum — Ordered Implementation Prompts

> This file defines the exact sequence of prompts to run in Claude Code (or any AI IDE) to implement the Duseum platform. Each prompt builds on the previous one. Run them in order. Do not skip steps.
>
> **Before running any prompt**: ensure `.claude/CLAUDE.md` is loaded and acknowledged.
> **Source of truth**: `PROJECT.md` — reference the listed sections in each prompt.
> **Spec gate**: Claude must produce a spec (Section 13.7 format) before writing code. Reply "Approved — proceed." to unblock implementation.
>
> **AWS Account**: `408141212087` (shared; both dev and prod deploy here)
> **GitHub Repo**: https://github.com/ryanwaite28/ai-projects-duseum

---

## Phase 0 — Manual Prerequisites

> Complete ALL of these steps before running any Stage 1 implementation prompts.
> Items marked ✅ are already done. Items marked ⬜ are pending.

### Infrastructure Already Completed (do not redo)

| Step | Status | Notes |
|---|---|---|
| Route53 hosted zone for `duseum.com` | ✅ Done | DNS already configured |
| ACM certificates | ✅ Done | Already issued; reference ARNs from existing certs in CDK |
| SES domain verification for `duseum.com` | ✅ Done | Already verified |
| SES identity `no-reply@duseum.com` | ✅ Done | Already verified |

### Steps Remaining Before Stage 1

#### PHASE-0.1 — Stripe Account Setup (👤 Manual — browser)

**Status**: ✅ Complete — two separate Stripe accounts provisioned (sandbox + live), webhook endpoints active, all keys stored in Secrets Manager via PHASE-0.4.

Reference (non-secret):
- Sandbox (dev): acct_1TMYUPDeejIUwJIS | webhook: https://api.dev.duseum.com/webhooks/stripe | connect: ca_ULF5h4bUlGnwEo3YRUioqoI8hogxwvcb
- Live (prod): acct_1TMYUIRUKQLlSd6o | webhook: https://api.prod.duseum.com/webhooks/stripe | connect: ca_ULF9jsCeRlmkF08gQBXwDqivNgiw38lA
- Publishable keys stored in SSM at `/duseum/{env}/stripe/publishable_key`
- Note: webhook endpoints subscribe to additional events beyond PROJECT.md spec — see PROMPT-3.2 for full handling

---

#### PHASE-0.2 — GitHub Repository Settings (👤 Manual — GitHub UI)

**Status**: ✅ Complete.

Configured secrets structure (environment-scoped secrets take precedence in workflows — use `${{ secrets.AWS_ROLE_ARN }}` in workflow files, not the repo-level `AWS_ROLE_ARN_DEV`/`AWS_ROLE_ARN_PROD`):

**Repository secrets** (repo-wide fallback / CI reference):
- `AWS_ACCOUNT_ID` = `408141212087`
- `AWS_ROLE_ARN_DEV` = `arn:aws:iam::408141212087:role/duseum-github-actions-deploy-dev`
- `AWS_ROLE_ARN_PROD` = `arn:aws:iam::408141212087:role/duseum-github-actions-deploy-prod`

**Environment secrets — `dev`**:
- `AWS_ROLE_ARN` = `arn:aws:iam::408141212087:role/duseum-github-actions-deploy-dev`
- `CLOUDFRONT_KEYPAIR_ID` = `K1WIG6RJRFSB4I`

**Environment secrets — `prod`**:
- `AWS_ROLE_ARN` = `arn:aws:iam::408141212087:role/duseum-github-actions-deploy-prod`
- `CLOUDFRONT_KEYPAIR_ID` = `K39EZRF2L5JQV2`

**GitHub Actions workflow pattern** (use environment-scoped secrets):
```yaml
jobs:
  deploy:
    environment: dev          # or prod
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}   # resolves per environment
          aws-region: us-east-1
```

---

#### PHASE-0.3 — OIDC Provider + IAM Deploy Roles (🤖 `scripts/bootstrap.sh`)

**Status**: ✅ Complete — provisioned by `bash scripts/bootstrap.sh`.

Resources created:
- OIDC provider: `arn:aws:iam::408141212087:oidc-provider/token.actions.githubusercontent.com`
- IAM role `duseum-github-actions-deploy-dev` — trust scoped to `repo:ryanwaite28/ai-projects-duseum:environment:dev`
- IAM role `duseum-github-actions-deploy-prod` — trust scoped to `repo:ryanwaite28/ai-projects-duseum:environment:prod`
- Both roles have `AdministratorAccess` attached (required for CDK deploys)
- Role ARNs stored in SSM: `/duseum/{env}/iam/github_deploy_role_arn`
- Tags on all resources: `Project=duseum`, `Environment={env}`, `ManagedBy=bootstrap`

**CDK bootstrap**: ✅ Complete — `duseum-cdk-toolkit` stack created in `aws://408141212087/us-east-1`.

```bash
# Already run — here for reference / re-bootstrap if needed:
cdk bootstrap aws://408141212087/us-east-1 --profile rmw-llc --toolkit-stack-name duseum-cdk-toolkit
```

---

#### PHASE-0.4 — Secrets Manager + SSM Seed (🤖 `scripts/bootstrap.sh`)

**Status**: ✅ Complete — all secrets and SSM parameters provisioned by `bash scripts/bootstrap.sh`.

Run the following to complete PHASE-0.4. Use `--profile rmw-llc` on all commands.

```bash
# ── LOGIN FIRST ────────────────────────────────────────────────────────────
aws sso login --profile rmw-llc

# ── DEV: Stripe secrets (already seeded — verify only) ─────────────────────
aws secretsmanager describe-secret --name duseum/dev/stripe/secret-key --profile rmw-llc
aws secretsmanager describe-secret --name duseum/dev/stripe/webhook-secret --profile rmw-llc
aws secretsmanager describe-secret --name duseum/dev/stripe/connect-client-id --profile rmw-llc

# ── DEV: Stripe publishable key → SSM (not secret; safe in Parameter Store) ─
aws ssm put-parameter \
  --name /duseum/dev/stripe/publishable_key \
  --value "pk_test_51TMYUPDeejIUwJISEIUi0r8IOsg8Gb6RxS89dJwUYvjIVzN0igd3kwBd6tt98jCbEu67iQGq0dtDoPw710rivNZM007I5KcOzz" \
  --type String \
  --tags Key=Project,Value=duseum Key=Environment,Value=dev \
  --profile rmw-llc

# ── DEV: CloudFront signed-URL RSA key pair ─────────────────────────────────
# Step 1: generate key pair
openssl genrsa -out /tmp/duseum-dev-cf-private.pem 2048
openssl rsa -pubout -in /tmp/duseum-dev-cf-private.pem -out /tmp/duseum-dev-cf-public.pem

# Step 2: upload public key to CloudFront (note the returned KeyPairId)
aws cloudfront create-public-key \
  --public-key-config '{
    "CallerReference": "duseum-dev-cf-key-1",
    "Name": "duseum-dev-cloudfront-signed-url-key",
    "EncodedKey": "'"$(cat /tmp/duseum-dev-cf-public.pem)"'",
    "Comment": "Duseum dev CloudFront signed URL key"
  }' \
  --profile rmw-llc
# → note the "Id" value (e.g. K1ABC123...) — this is the CloudFront Key Pair ID

# Step 3: store private key in Secrets Manager
aws secretsmanager create-secret \
  --name duseum/dev/cloudfront/private-key \
  --secret-string "$(cat /tmp/duseum-dev-cf-private.pem)" \
  --tags Key=Project,Value=duseum Key=Environment,Value=dev \
  --profile rmw-llc

# Step 4: store key pair ID in SSM
aws ssm put-parameter \
  --name /duseum/dev/cloudfront/key_pair_id \
  --value "REPLACE_WITH_CLOUDFRONT_KEY_ID_FROM_STEP_2" \
  --type String \
  --tags Key=Project,Value=duseum Key=Environment,Value=dev \
  --profile rmw-llc

# Step 5: clean up local key files
rm /tmp/duseum-dev-cf-private.pem /tmp/duseum-dev-cf-public.pem

# ── DEV: SES from-address ───────────────────────────────────────────────────
aws secretsmanager create-secret \
  --name duseum/dev/ses/from-address \
  --secret-string "no-reply@duseum.com" \
  --tags Key=Project,Value=duseum Key=Environment,Value=dev \
  --profile rmw-llc

# ── DEV: Unsubscribe HMAC secret ───────────────────────────────────────────
aws secretsmanager create-secret \
  --name duseum/dev/notifications/unsubscribe-secret \
  --secret-string "$(openssl rand -hex 32)" \
  --tags Key=Project,Value=duseum Key=Environment,Value=dev \
  --profile rmw-llc

# ── PROD: same set with prod values ────────────────────────────────────────
# Replace pk_live_* / sk_live_* / whsec_* / ca_prod values accordingly.
# CloudFront: generate a SEPARATE key pair for prod (same steps, name = duseum-prod-cloudfront-signed-url-key)
# SSM publishable key path: /duseum/prod/stripe/publishable_key
# Secrets Manager paths: duseum/prod/stripe/*, duseum/prod/cloudfront/*, etc.
```

---

#### PHASE-0.5 — AWS Billing Alerts (👤 Manual — AWS Console)

```
AWS Console → Billing → Budgets:
1. Create budget: $50/month threshold → email alert → ryanwaite28@gmail.com
2. Create budget: $200/month threshold → email alert → ryanwaite28@gmail.com

These apply to the entire account 408141212087. This catches runaway costs from any project.
```
**Status**: ⬜ Pending.

---

### PROMPT-0.3 — CDK OidcStack (Bootstrap + IAM OIDC Roles)

> Run this prompt BEFORE any other CDK work. Output the IAM role ARNs to use in PHASE-0.2.

```
Read CLAUDE.md. Read PROJECT.md Sections 5.2, 5.5, 13.4, 13.5, and 11.3.

Produce a spec, then implement infrastructure/stacks/oidc-stack.ts — an OidcStack CDK stack that:

1. Creates (or references existing) GitHub Actions OIDC provider:
   - URL: https://token.actions.githubusercontent.com
   - Audience: sts.amazonaws.com
   - Use fromExisting if already present (idempotent)

2. Creates TWO IAM roles — one for dev deploys, one for prod deploys:
   Role name: duseum-github-actions-deploy-dev
   Role name: duseum-github-actions-deploy-prod
   
   Trust policy (OIDC federated):
   - Principal: arn:aws:iam::408141212087:oidc-provider/token.actions.githubusercontent.com
   - Condition StringLike sub: repo:ryanwaite28/ai-projects-duseum:environment:dev (and :prod respectively)
   - Additional condition: repo:ryanwaite28/ai-projects-duseum:ref:refs/heads/develop (dev role)
   - Additional condition: repo:ryanwaite28/ai-projects-duseum:ref:refs/tags/v*.*.* (prod role)

   Permissions policy:
   - AdministratorAccess (CDK deploy requires broad permissions for resource creation)
   - Scope by condition: aws:RequestedRegion = us-east-1 (restrict to project region)
   - Named: duseum-github-actions-deploy-policy-{env}

3. Tags ALL resources: Project=duseum, Environment={env}, ManagedBy=CDK, Stack=OidcStack

4. Outputs both role ARNs to console and to SSM:
   /duseum/{env}/stacks/oidc/deploy_role_arn

5. Also implement a bootstrap GitHub Actions workflow:
   .github/workflows/bootstrap.yml
   - workflow_dispatch with input: environment (choice: dev | prod)
   - Separate jobs: bootstrap-dev and bootstrap-prod, each using aws-actions/configure-aws-credentials with a BOOTSTRAP_ROLE_ARN secret (a one-time admin role the developer manually creates and deletes after bootstrap is complete)
   - Each job runs: npx cdk bootstrap aws://408141212087/us-east-1 --context env={env} then npx cdk deploy OidcStack --context env={env}
   - Jobs are NOT parallel — bootstrap-prod has needs: [bootstrap-dev] or can be run independently via environment input

Deploy instructions to output in spec:
  aws sts get-caller-identity   # verify you are authenticated to 408141212087
  cd infrastructure
  npx cdk deploy OidcStack --context env=dev   # run dev first
  npx cdk deploy OidcStack --context env=prod  # run prod after
  # Note the role ARN outputs — add them to GitHub secrets (PHASE-0.2)
```

---

## Stage 1 — Foundation

### PROMPT-1.1 — Monorepo Scaffold

**Status**: ✅ Complete

```
Read CLAUDE.md and acknowledge the project rules. Then read PROJECT.md Section 6.1 (monorepo structure) and Section 10.4 (Turbo pipeline).

Produce a spec, then scaffold the complete monorepo directory structure exactly as defined in Section 6.1:
- Root package.json (npm workspaces: frontend, lambdas/*, packages/shared)
- turbo.json (pipeline config from Section 10.4)
- .gitignore (Node.js + CDK + build artifacts)
- .env.example (all env vars from Section 10.3 with placeholder values)
- All Lambda directories under lambdas/ (11 lambdas from Section 4.2) — empty package.json + tsconfig.json only, no implementation yet
- packages/shared/ — package.json + tsconfig.json + empty src/ subdirectories (db/, auth/, types/, errors/, middleware/, stripe/, s3/, notifications/, features/)
- infrastructure/ — package.json, tsconfig.json, cdk.json, bin/duseum.ts stub, stacks/ directory with empty stack files, constructs/ directory
- frontend/ — Vite + React 18 + TypeScript scaffold (vite.config.ts, tsconfig.json, package.json with Tailwind + Zustand + React Query + AWS Amplify)
- scripts/ — empty seed-local.ts and smoke-test.sh
- .github/workflows/ — empty workflow files (ci.yml, deploy-dev.yml, deploy-prod.yml, _build-lambdas.yml, _cdk-deploy.yml)
- docker-compose.yml (MiniStack config from Section 16.1)

Do not implement any business logic yet. Only structure and config files.
```

---

### PROMPT-1.2 — Shared Package Foundation

**Status**: ✅ Complete

```
Read CLAUDE.md. Read PROJECT.md Sections 6.4 (repository pattern), 6.5 (access control), 6.6 (domain types), 6.7 (error handling), 4.7 (DynamoDB table design), and 10.3 (env vars / secrets pattern).

Produce a spec, then implement packages/shared/src/:

1. types/ — all TypeScript types from Section 6.6: UserAccount, ViewerProfile, AuthorProfile, ArtPiece, ArtCategory, Subscription, UploadIntent, Comment, Reaction, WeeklyFeatureBooking, DailyFeatureLog, NotificationPref, NotificationPreference, Follow, Collection, CollectionItem

2. errors/index.ts — AppError + all subclasses from Section 6.7 (NotFoundError, UnauthorizedError, ForbiddenError, PaymentRequiredError, ValidationError, ConflictError)

3. db/client.ts — DynamoDB document client with AWS_ENDPOINT_URL override pattern from Section 16.2

4. auth/access-control.ts — checkArtPieceAccess() from Section 6.5

5. secrets.ts — Secrets Manager getters with module-level cache (getStripeKey, getStripeWebhookSecret, getCloudfrontPrivateKey, getUnsubscribeSecret) from Section 10.3

6. notifications/index.ts — resolveNotificationPref(viewerProfile, perAuthorOverride | undefined): NotificationPref — returns the effective pref applying global opt-out and per-author override logic (FR-NOTIF-07)

7. features/index.ts — ISO week utilities: getCurrentIsoWeek(), getIsoWeekForDate(), addWeeks(), isWithinThreeMonthWindow(bookingIsoWeek, nowDate), getEligibleWeeks(advanceWeeks): string[]

Include unit tests for access-control.ts (all 8 branches from Section 15.2), errors/index.ts, notifications/index.ts preference resolver, and features/index.ts ISO week math.
```

---

### PROMPT-1.3 — Shared Middleware & Middy Stack

**Status**: ✅ Complete

```
Read CLAUDE.md. Read PROJECT.md Sections 6.2 (Lambda handler pattern), 13.2 (Lambda coding conventions).

Produce a spec, then implement packages/shared/src/middleware/:

1. logger.ts — structured JSON logger middleware using @aws-sdk powertools Logger. Attaches requestId + userId (from JWT context if available) to every log line. Never logs PII.

2. auth.ts — cognitoAuthMiddleware: validates Bearer JWT from Authorization header against Cognito JWKS endpoint (COGNITO_USER_POOL_ID env var). On valid token: attaches { userId, email, groups } to event.requestContext.authorizer. On missing/invalid token for protected routes: throws UnauthorizedError. On public routes (configurable allowlist): skips validation.

3. error-handler.ts — errorHandlerMiddleware: catches AppError subclasses → maps to HTTP response with { error: { code, message, requestId } } shape. Catches unknown errors → 500 InternalServerError. Never leaks stack traces.

4. validate-body.ts — validateBody<T>(schema: ZodSchema<T>)(body: unknown): T — throws ValidationError on failure. Use Zod for all request body validation.

Show the complete Middy handler assembly pattern (as in Section 6.2) so each Lambda team member can copy it.
```

---

### PROMPT-1.4 — CDK Infrastructure Stacks (Storage, Auth, Messaging)

**Status**: ✅ Complete

```
Read CLAUDE.md. Read PROJECT.md Sections 5.2 (stack inventory), 5.3 (dependency graph), 5.4 (SSM output registry), 5.5 (naming convention), 5.6 (IAM roles), 5.7 (Secrets Manager keys), 4.7 (DynamoDB table design), 13.4 (CDK conventions), 13.5 (infra conventions).

Context:
- AWS account 408141212087 (single shared account for dev and prod — {env} context variable isolates all resources)
- Route53 hosted zone for duseum.com is already provisioned — do NOT create it in CDK; reference it via HostedZone.fromLookup()
- ACM certificates are already issued — do NOT create new ones in CDK; reference them via Certificate.fromCertificateArn() using SSM-stored ARNs or CDK context values
- SES domain + no-reply@duseum.com are already verified — do NOT configure SES verification in CDK
- All IAM roles use duseum- prefix and are tagged Project=duseum, Environment={env}, ManagedBy=CDK

Produce a spec, then implement the following CDK stacks:

1. infrastructure/constructs/lambda-function.ts — DuseumLambdaFunction construct: Node.js 20, ARM64, X-Ray active, structured JSON log format, 14-day log retention (dev) / 90-day (prod), esbuild bundling, configurable reserved concurrency. Applies standard tags (Project=duseum, Environment={env}, Stack={stackName}).

2. infrastructure/stacks/storage-stack.ts — StorageStack:
   - S3 media bucket duseum-{env}-s3-media (private, versioning enabled, CORS for presigned PUT, lifecycle rule: abort incomplete multipart uploads after 1 day)
   - S3 SPA bucket duseum-{env}-s3-spa (static website hosting enabled)
   - DynamoDB main table (duseum-{env}-dynamodb-main): full key schema + all GSIs from Section 4.7 (GSI-AuthorPublic, GSI-AllPublicPieces, GSI-FollowersByAuthor, GSI-SubscribersByAuthor, GSI-TagIndex, GSI-WeeklyFeatureByStatus), on-demand billing, point-in-time recovery enabled for prod
   - DynamoDB idempotency table (duseum-{env}-dynamodb-idempotency), TTL attribute: ttl
   - DynamoDB config table (duseum-{env}-dynamodb-config)
   - All SSM outputs per Section 5.4 storage section

3. infrastructure/stacks/auth-stack.ts — AuthStack:
   - Cognito User Pool (duseum-{env}-cognito-userpool): email sign-in, password policy (min 8 chars, require symbols), SRP auth flow, optional MFA (TOTP), self-sign-up enabled
   - Google OAuth identity provider (client ID/secret read from Secrets Manager at synth time via CDK custom resource — placeholder for now, wired when Google OAuth creds are available)
   - User Pool Client (no client secret — SPA client)
   - Post-Confirmation Lambda trigger: wired via a CDK parameter (Lambda ARN from auth-triggers-lambda, added in PROMPT-1.5)
   - SSM outputs per Section 5.4 auth section

4. infrastructure/stacks/messaging-stack.ts — MessagingStack:
   - SQS queue duseum-{env}-sqs-stripe-webhooks (visibility timeout 60s) + DLQ duseum-{env}-sqs-stripe-webhooks-dlq (maxReceiveCount 3)
   - SQS queue duseum-{env}-sqs-notifications + DLQ duseum-{env}-sqs-notifications-dlq (maxReceiveCount 3)
   - EventBridge rule: duseum-{env}-eventbridge-daily-featured-author (cron 0 0 * * ? *, state ENABLED)
   - EventBridge rule: duseum-{env}-eventbridge-weekly-feature-rotation (cron 0 0 ? * MON *, state ENABLED)
   - SNS topic: duseum-{env}-sns-admin-alerts
   - All SSM outputs per Section 5.4 messaging section

5. infrastructure/bin/duseum.ts — CDK app entry point. Reads env + sha from CDK context. env must be 'dev' or 'prod' — throw if missing. Account: 408141212087, Region: us-east-1.

6. infrastructure/constructs/duseum-stage.ts — DuseumStage: composes StorageStack + AuthStack + MessagingStack in the correct dependency order per Section 5.3. (ApiStack + CdnStack + MonitoringStack added in later prompts.)

Verify: npx cdk synth --strict outputs zero warnings/errors for both env=dev and env=prod.
```

---

### PROMPT-1.5 — auth-triggers-lambda (Cognito Post-Confirmation)

**Status**: ✅ Complete

```
Read CLAUDE.md. Read PROJECT.md Sections 4.2 (Lambda inventory), 2.1 (FR-AUTH-01/02), 2.2 (FR-PROF-01/02), 6.2 (handler pattern), 6.4 (repository pattern), 13.2 (coding conventions).

Produce a spec, then implement lambdas/auth-triggers/:

Handler triggers on Cognito Post-Confirmation. When a user confirms their email:
1. Extract userId (sub), email from the Cognito event
2. Create UserAccount record in DynamoDB: PK=USER#{userId}, SK=PROFILE
3. Create ViewerProfile record: PK=USER#{userId}, SK=PROFILE#VIEWER with status=ACTIVE, notificationGlobalOptOut=false, defaultNotificationPref=ALL_NEW_PIECES
4. Return the Cognito event unchanged (Cognito trigger contract)

Also implement:
- packages/shared/src/db/users.repository.ts: createUserAccount(), createViewerProfile(), getUserAccount(), getViewerProfile(), getAuthorProfile()
- Wire the Lambda ARN into AuthStack CDK Post-Confirmation trigger

Write integration tests (MiniStack): verify UserAccount + ViewerProfile records created after simulated post-confirmation trigger.
```

---

### PROMPT-1.6 — MiniStack Local Dev Setup

**Status**: ✅ Complete

```
Read CLAUDE.md. Read PROJECT.md Section 16 (local development) in full.

Produce a spec, then implement the complete local development environment:

1. docker-compose.yml — finalize with MiniStack service + ministack-init service (complete init script from Section 16.1 including all DynamoDB tables with GSIs, S3 buckets, SQS queues, Secrets Manager secrets, SES identity, EventBridge rules, config table seeds)

2. scripts/dev-server.ts — lightweight local Lambda HTTP server (tsx watch, hot reload):
   - Listens on port 3001
   - Routes requests by path prefix to the correct Lambda handler module
   - Sets AWS_ENDPOINT_URL=http://localhost:4566 and all required env vars
   - Simulates API Gateway event shape (APIGatewayProxyEventV2)
   - Passes Authorization header through to Lambda event

3. package.json root scripts:
   - dev:lambdas — starts the dev server (tsx watch scripts/dev-server.ts)
   - dev — runs docker-compose up -d && dev:lambdas in parallel (concurrently)

4. Verify: docker-compose up -d starts cleanly; ministack-init exits 0; curl http://localhost:4566/_ministack/health returns healthy.
```

---

## Stage 2 — Core Art Piece Flow

### PROMPT-2.1 — media-lambda (Upload Intent)

**Status**: ✅ Complete

```
Read CLAUDE.md. Read PROJECT.md Sections 4.2, 4.3 (upload flow), 8.3 (POST /media/upload-intent API), 5.6 (IAM), 6.6 (UploadIntent type).

Produce a spec, then implement lambdas/media/:
- POST /media/upload-intent: validate JWT (Author only), validate mimeType allowlist (JPEG/PNG/WEBP/GIF) + sizeBytes (≤ 20MB), generate UUID s3Key, generate S3 presigned PUT URL (10-min TTL), write UploadIntent to DynamoDB (status: PENDING), return intentId + uploadUrl + s3Key + expiresAt
- packages/shared/src/db/upload-intents.repository.ts: createUploadIntent(), getUploadIntent(), markUploadIntentConsumed()
- packages/shared/src/s3/index.ts: generatePresignedPutUrl(), headObject()
- Update MediaStack IAM role in CDK (Section 5.6)

Integration tests: non-Author → 403; valid Author → presigned URL returned; invalid mimeType → 400; oversized → 400.
```

---

### PROMPT-2.2 — artworks-lambda (Core CRUD)

**Status**: ✅ Complete

```
Read CLAUDE.md. Read PROJECT.md Sections 4.2, 4.3, 4.4 (request flows), 4.6 (notification fan-out — enqueue only), 8.2 (artworks API), 2.5 (FR-ART-*), 6.5 (access control), 5.6 (IAM).

Produce a spec, then implement lambdas/artworks/:

Routes:
- GET /artworks — list public pieces (free-tier limit enforced, pagination, tag/category/sort filters)
- GET /artworks/{artworkId} — get single piece with full access tier logic (checkArtPieceAccess), CloudFront signed URL for PRIVATE pieces
- POST /artworks — create piece (Author only): validate s3Key against UploadIntent, HeadObject S3, create ArtPiece record; if visibility=PUBLIC or PRIVATE → enqueue NEW_PIECE_PUBLISHED to notification SQS queue (fire-and-forget, does NOT block response)
- PUT /artworks/{artworkId} — update metadata/visibility (Author only, own pieces)
- DELETE /artworks/{artworkId} — archive (soft delete) or permanent delete with ?permanent=true (removes S3 object)

Also implement:
- packages/shared/src/db/artworks.repository.ts: createArtPiece(), getArtPiece(), updateArtPiece(), listArtPiecesByAuthor(), listPublicArtPieces()
- packages/shared/src/s3/cloudfront-signer.ts: generateSignedUrl(s3Key, ttlSeconds): reads CloudFront private key from Secrets Manager
- packages/shared/src/sqs/index.ts: sendMessage(queueUrl, body)

Critical: POST /artworks must return 201 BEFORE the SQS message is processed. Notification fan-out happens asynchronously in notifications-lambda. Never call SES or query Follow records here.

Integration tests per Section 15.3 (get-artwork.integration.test.ts + publish-piece.integration.test.ts).
```

---

### PROMPT-2.3 — users-lambda (Users & Author Onboarding)

**Status**: ✅ Complete

```
Read CLAUDE.md. Read PROJECT.md Sections 4.2, 8.4 (user profile API), 8.5 (authors API), 2.2 (FR-PROF-*), 2.3 (FR-VIEW-*), 2.4 (FR-AUTH-PROF-*).

Produce a spec, then implement lambdas/users/:

Routes:
- GET /users/me — return UserAccount + ViewerProfile + AuthorProfile (if exists)
- PUT /users/me/viewer — update ViewerProfile (displayName, notification prefs)
- POST /users/me/author — Author onboarding: create AuthorProfile (status: PENDING_SETUP → ACTIVE after required fields), validate displayName + bio
- PUT /users/me/author — update AuthorProfile
- GET /users/{userId}/profile — public profile page (Author display name, bio, public gallery preview)
- GET /authors — paginated author directory (sort by subscriberCount or newest)
- GET /authors/{authorId} — Author public profile + paginated public gallery
- GET /authors/{authorId}/collections — Author's public collections

Also implement:
- packages/shared/src/db/authors.repository.ts: createAuthorProfile(), updateAuthorProfile(), getAuthorProfile(), listAuthors()
- packages/shared/src/db/collections.repository.ts: createCollection(), getCollection(), listCollectionsByAuthor(), addArtPieceToCollection()

Integration tests: POST /users/me/author creates profile with ACTIVE status; GET /users/me returns both profiles; GET /authors paginates correctly.
```

---

### PROMPT-2.4 — CDK ApiStack + CdnStack

**Status**: ✅ Complete

```
Read CLAUDE.md. Read PROJECT.md Sections 5.2 (ApiStack, CdnStack), 5.3 (dependency graph), 5.4 (SSM outputs), 5.6 (IAM roles), 7.5 (WAF rules), 13.4 (CDK conventions).

Produce a spec, then implement:

1. infrastructure/stacks/cdn-stack.ts — CdnStack:
   - CloudFront distribution for SPA: duseum-{env}-cloudfront-app (S3 SPA bucket origin, OAC, HTTPS only, HTTP→HTTPS redirect)
   - CloudFront distribution for media: duseum-{env}-cloudfront-media (S3 media bucket origin, OAC, signed URL behavior for private/* prefix path pattern)
   - ACM certificate: reference the EXISTING certificate via Certificate.fromCertificateArn() — do NOT create a new cert. Store cert ARN in CDK context or SSM. For dev: covers dev.duseum.com, api.dev.duseum.com, media.dev.duseum.com. For prod: covers duseum.com, api.duseum.com, media.duseum.com.
   - Route53: reference EXISTING hosted zone via HostedZone.fromLookup() — do NOT create a new hosted zone. Add A records aliasing to CloudFront distributions.
   - CloudFront key pair for signed URLs: the public key ID is stored in SSM; the private key PEM is in Secrets Manager at duseum/{env}/cloudfront/private-key. Do NOT create a new key pair in CDK — reference the existing key pair ID from SSM context.
   - SSM outputs per Section 5.4

2. infrastructure/stacks/api-stack.ts — ApiStack:
   - API Gateway HTTP API
   - Cognito JWT authorizer (references AuthStack user pool)
   - Lambda functions (all 11 from Section 4.2): DuseumLambdaFunction construct, each with correct IAM role per Section 5.6
   - API GW → Lambda integrations with routes per Section 8
   - SQS integration for POST /webhooks/stripe (API GW → SQS direct, no Lambda in hot path — Section 4.5)
   - WAF WebACL with rules from Section 7.5 attached to API GW and CloudFront
   - SSM outputs per Section 5.4

3. Add ApiStack + CdnStack to DuseumStage construct (infrastructure/constructs/duseum-stage.ts) with correct stack dependencies (Section 5.3).

Verify: cdk synth --strict passes for both env=dev and env=prod.
```

---

### PROMPT-2.5 — Frontend Scaffold + Auth Flow + Design System Foundation

**Status**: ✅ Complete

```
Read CLAUDE.md (pay close attention to the Frontend Design System section). Read PROJECT.md Sections 6.8 (design system — full section), 13.3 (frontend conventions), 7.1 (auth flow), 8.4 (users API).

Produce a spec, then implement the React frontend foundation:

1. Vite + React 18 + TypeScript baseline with the complete design system wired in:
   - tailwind.config.ts — exact config from Section 6.8.3 (custom colors: ink/parchment/gold/stone/warm-white; fontFamily: display/body/mono; borderRadius; easing; animations; keyframes; backgroundImage patterns)
   - postcss.config.js — standard Tailwind + Autoprefixer
   - frontend/src/styles/globals.css — CSS custom properties from Section 6.8.2 (:root tokens) + .reveal / .reveal-delay-* animation classes + @tailwind directives
   - index.html — Google Fonts preconnect + Playfair Display / DM Sans / DM Mono link tag (Section 6.8.4)

2. Shared UI primitives (frontend/src/components/ui/):
   - EyebrowLabel.tsx — flanked eyebrow component (Section 6.8.8)
   - Button.tsx — three variants: primary (gold fill), secondary (transparent/gold border), ghost (nav CTA) — exact classes from CLAUDE.md design system section
   - Badge.tsx — gold and muted variants (Section 6.8.6)
   - GoldDivider.tsx — `<div className="w-12 h-px bg-gold opacity-50 my-6" />`
   - cn.ts — clsx + tailwind-merge utility

3. useReveal.ts hook — IntersectionObserver scroll reveal (Section 6.8.6 Scroll Reveal)

4. App shell:
   - NavBar component — exact pattern from Section 6.8.6 (fixed, backdrop-blur, gold border-b, D logo mark, nav links)
   - Page layout wrapper with section alternation support
   - React Router setup: /, /login, /register, /verify-email, /browse, /authors (stubs)
   - Protected route wrapper component

5. AWS Amplify Cognito integration: configure Auth with user pool + client IDs (from VITE_ env vars), token storage (access token in memory, refresh token in httpOnly cookie via Amplify)

6. frontend/src/store/auth.store.ts — Zustand: { user, accessToken, isLoading, signIn, signOut, signUp, confirmEmail }

7. frontend/src/services/api.ts — base fetch wrapper: attaches Authorization: Bearer {token}, handles 401 (refresh), throws typed ApiError

8. frontend/src/hooks/use-me.ts — React Query hook: GET /users/me

9. /login and /register pages — styled with the design system (dark ink background, gold accents, Playfair Display headings, DM Sans body)

Test: npm run dev at localhost:5173; design tokens visible (dark background, gold accents); login flow functional.
```

---

### PROMPT-2.6 — Frontend: Browse, Art Piece Detail, Author Upload

**Status**: ✅ Complete

```
Read CLAUDE.md. Read PROJECT.md Sections 8.2 (artworks API), 8.3 (media upload), 8.4 (users API), 2.5 (FR-ART-*), 2.3 (FR-VIEW-*), 13.3 (frontend conventions).

Produce a spec, then implement:

1. frontend/src/services/artworks.service.ts — typed API client for all /artworks endpoints
2. frontend/src/hooks/use-artworks.ts — React Query: list artworks (pagination, filters)
3. frontend/src/hooks/use-artwork.ts — React Query: single artwork
4. Pages/components:
   - Homepage: Daily Featured Author spotlight (placeholder data), Weekly Featured Authors carousel (placeholder), recent public pieces grid
   - Browse page: filterable/sortable grid, tag chips, category filter, cursor pagination
   - Art Piece Detail page: full image (CloudFront URL), metadata, Author info, reaction buttons (UI only), comment thread (UI only)
   - Author Profile page: bio, cover photo, public gallery, collections list, subscription CTA (UI only)
5. Author Upload flow:
   - POST /media/upload-intent → direct PUT to S3 presigned URL → POST /artworks
   - Progress indicator, file validation (types + size) client-side before upload
   - Form: title, description, category, tags (up to 10), visibility selector

Test: upload a real image through the full flow (presigned URL → S3 → artworks-lambda → piece appears in gallery).
```

---

## Stage 3 — Subscriptions & Monetization

### PROMPT-3.1 — subscriptions-lambda (Stripe Checkout & Portal)

**Status**: ✅ Complete

```
Read CLAUDE.md. Read PROJECT.md Sections 4.2, 2.7 (FR-SUB-*), 8.6 (subscriptions API), 5.6 (IAM).

Produce a spec, then implement lambdas/subscriptions/:

Routes:
- GET /subscriptions/me — return caller's active platform subscription + all Author subscriptions from DynamoDB
- POST /subscriptions/platform — create Stripe Checkout session (mode: subscription, price: PLATFORM_SUB_PRICE_ID from config table)
- POST /subscriptions/authors/{authorId} — create Stripe Checkout session for Author subscription (Author must have Stripe Connect account + authorSubscriptionPriceId set)
- POST /subscriptions/portal — create Stripe Billing Portal session

Also implement:
- packages/shared/src/stripe/index.ts: Stripe client wrapper (reads sk from Secrets Manager), createCheckoutSession(), createBillingPortalSession(), createPaymentIntent(), constructWebhookEvent()
- packages/shared/src/db/subscriptions.repository.ts: getSubscription(), getPlatformSubscription(), getAuthorSubscription(), listUserSubscriptions(), upsertSubscription()

Integration tests: GET /subscriptions/me returns empty when no subscriptions; POST /subscriptions/platform returns checkoutUrl; non-existent authorId → 404.
```

---

### PROMPT-3.2 — subscriptions-webhook-lambda (Stripe Events + Idempotency) ✅ Complete

```
Read CLAUDE.md. Read PROJECT.md Sections 4.5 (webhook flow), 4.2, 2.7 (FR-SUB-03/06), 2.11 (FR-FEAT-12/17), 3.4 (NFR-REL-01/02), 13.1 Rule 6.

Produce a spec, then implement lambdas/subscriptions-webhook/:

This is the most critical correctness requirement. Every handler MUST:
1. Construct and verify Stripe event signature (constructWebhookEvent from shared stripe package)
2. Check idempotency table (PK=STRIPE#{eventId}) — if already processed, return success immediately
3. Route to event handler
4. Write eventId to idempotency table with 7-day TTL

Event handlers — mapped events (idempotency check applies to ALL):
- customer.subscription.created → upsertSubscription (status: ACTIVE)
- customer.subscription.updated → upsertSubscription (status from Stripe, update currentPeriodEnd)
- customer.subscription.deleted → mark subscription CANCELLED
- customer.subscription.paused → mark subscription PAUSED (extra event subscribed in Stripe dashboard)
- customer.subscription.resumed → mark subscription ACTIVE (extra event subscribed in Stripe dashboard)
- invoice.payment_failed → mark subscription PAST_DUE
- invoice.payment_succeeded → idempotency write only; no DynamoDB state change (subscribed for completeness; Stripe recommends it)
- payment_intent.succeeded → if metadata.type === 'WEEKLY_FEATURE' → set WeeklyFeatureBooking status to CONFIRMED
- payment_intent.payment_failed → if metadata.type === 'WEEKLY_FEATURE' → set WeeklyFeatureBooking status to CANCELLED (release slot)

Graceful no-ops (log at INFO + write idempotency + return success — never error or retry):
- subscription_schedule.* events → not used in v1; log event type and skip
- customer.subscription.trial_will_end → no trials in v1; log and skip
- customer.subscription.pending_update_applied / pending_update_expired → log and skip
- Any other unrecognised event type → log WARNING with eventType + eventId, skip

Note: The Stripe webhook endpoints are already configured and active:
- dev:  https://api.dev.duseum.com/webhooks/stripe  (destination: we_1TMiBcDeejIUwJISRTd0wITw)
- prod: https://api.prod.duseum.com/webhooks/stripe  (destination: we_1TMiH8RUKQLlSd6oP9UMFQ3C)

Also implement:
- packages/shared/src/db/weekly-feature-bookings.repository.ts: getBooking(), createBooking(), updateBookingStatus(), listBookingsByWeek(), countActiveBookingsForWeek(), getRecentBookingsByAuthor()
- packages/shared/src/db/idempotency.repository.ts: checkAndMarkProcessed()

Integration tests per Section 15.3 (stripe-webhook.integration.test.ts): all mapped event types + paused/resumed + graceful no-op for unknown types + replay idempotency + invalid signature drop.
```

---

### PROMPT-3.3 — Stripe Connect Author Onboarding ✅ Complete

```
Read CLAUDE.md. Read PROJECT.md Sections 2.4 (FR-AUTH-PROF-05/07), 2.7 (FR-SUB-07/08).

Produce a spec, then implement Stripe Connect Express onboarding for Authors:

Backend (lambdas/subscriptions/ — new routes):
- POST /subscriptions/connect/onboard — create Stripe Connect Express account link for Author; store stripeConnectAccountId on AuthorProfile
- GET /subscriptions/connect/status — return Stripe Connect account status (charges_enabled, details_submitted)
- POST /users/me/author/subscription-price — set/update authorSubscriptionPriceId: create Stripe Price object on Author's Connect account (amount in cents, currency USD, recurring monthly); store price ID + monthlyUsd on AuthorProfile

Frontend:
- Author dashboard: "Connect Stripe" CTA → redirect to Stripe Connect onboarding → return URL → poll connect/status
- "Set subscription price" form (min $1, max $50/month)
- Disable Author subscription toggle

Integration tests: POST /subscriptions/connect/onboard returns accountLink URL; only Authors with active Connect accounts can set prices.
```

---

### PROMPT-3.4 — Access Tier Enforcement (Free Tier Limit + Subscriber Checks) ✅ Complete

```
Read CLAUDE.md. Read PROJECT.md Sections 6.5 (access control), 4.4 (private piece access flow), 1.4 (access tier matrix), 2.7 (FR-SUB-10).

Produce a spec, then wire full access tier enforcement in artworks-lambda:

1. GET /artworks: apply free-tier limit (FREE_TIER_LIMIT from config table) — the {n}th public piece per Author becomes the cutoff. Pieces beyond the limit in the response include accessTier: 'REQUIRES_PLATFORM_SUB' and no thumbnailUrl.

2. GET /artworks/{artworkId}: wire checkArtPieceAccess() with live data:
   - Load FREE_TIER_LIMIT from config table (cache per Lambda warm invocation)
   - Load caller's platform subscription status from DynamoDB
   - Load caller's Author subscription status from DynamoDB
   - Determine authorPieceIndex (rank of this piece in Author's public gallery)
   - Return signed CloudFront URL for PRIVATE pieces (Author subscriber only)

3. Test all 8 access branches from Section 15.2 against real MiniStack DynamoDB.
```

---

### PROMPT-3.5 — Frontend: Subscription Flows + Upsell UI ✅ COMPLETE

```
Read CLAUDE.md. Read PROJECT.md Sections 8.6, 2.7, 13.3 (frontend conventions).

Produce a spec, then implement:

1. Subscription status context: React Query hook use-subscriptions.ts (GET /subscriptions/me)
2. Platform subscription upsell: when piece is beyond free tier → "Subscribe to platform" modal/banner with checkout CTA
3. Author subscription CTA: on Author profile page → "Access [Author]'s private section" card with price + Stripe checkout redirect
4. Subscription management page: list all active subscriptions, "Manage billing" button → POST /subscriptions/portal → redirect to Stripe Portal
5. Stripe checkout return page (/subscription/success, /subscription/cancel) with status polling

Test: full subscription flow with Stripe test card 4242... in test mode.
```

---

## Stage 4 — Social Features & Notifications

### PROMPT-4.1 — social-lambda (Comments & Reactions) ✅ COMPLETE

```
Read CLAUDE.md. Read PROJECT.md Sections 4.2, 2.9 (FR-SOC-*), 8.7 (social API), 6.6 (Comment/Reaction types).

Produce a spec, then implement lambdas/social/:

Routes:
- GET /artworks/{artworkId}/comments — list comments (paginated, pinned first)
- POST /artworks/{artworkId}/comments — post comment (max 1000 chars, optional parentCommentId for one-level reply)
- DELETE /comments/{commentId} — soft delete (own comment or Author of piece)
- PUT /artworks/{artworkId}/reactions — upsert reaction (LOVE/WOW/FIRE/INSPIRED; replaces previous)
- DELETE /artworks/{artworkId}/reactions — remove reaction

Also implement:
- packages/shared/src/db/comments.repository.ts: createComment(), listComments(), softDeleteComment(), pinComment()
- packages/shared/src/db/reactions.repository.ts: upsertReaction(), deleteReaction(), getReactionCounts()

Integration tests: post comment → appears in list; reaction upsert replaces previous; Author can delete comments on their own piece; non-owner cannot delete other's comment.
```

---

### PROMPT-4.2 — users-lambda: Follow/Unfollow + Notification Preferences ✅ COMPLETE

```
Read CLAUDE.md. Read PROJECT.md Sections 2.3 (FR-VIEW-06/06a/09/10), 8.8 (follows + notification preferences API), 2.12 (FR-NOTIF-*), 6.6 (NotificationPreference type).

Produce a spec, then add to lambdas/users/:

Routes:
- POST /follows/authors/{authorId} — follow Author; create Follow record + NotificationPreference record (pref = viewer's defaultNotificationPref)
- DELETE /follows/authors/{authorId} — unfollow; delete Follow record + NotificationPreference record
- GET /follows/authors — list followed Authors with notificationPref per Author
- GET /users/me/notification-preferences — get global opt-out + defaultPref + all per-author overrides
- PUT /users/me/notification-preferences — update global opt-out, defaultPref, and/or per-author overrides
- GET /notifications/unsubscribe?token=... (public, no JWT) — verify signed JWT, set per-author pref to NONE

Also implement:
- packages/shared/src/db/follows.repository.ts: createFollow(), deleteFollow(), listFollowsByViewer(), listFollowersByAuthor()
- packages/shared/src/db/notification-preferences.repository.ts: upsertPreference(), getPreference(), deletePreference(), listPreferencesByViewer()
- packages/shared/src/auth/unsubscribe-token.ts: generateUnsubscribeToken(viewerId, authorId): string, verifyUnsubscribeToken(token): { viewerId, authorId }

Unit tests: unsubscribe token sign/verify/expire/tamper. Integration tests: follow → preference created; unfollow → preference deleted; unsubscribe link sets pref to NONE.
```

---

### PROMPT-4.3 — notifications-lambda (New-Piece Email Fan-Out) ✅ Complete

```
Read CLAUDE.md. Read PROJECT.md Sections 4.6 (fan-out flow), 2.12 (FR-NOTIF-01 through FR-NOTIF-12), 4.7 (DynamoDB Follow/NotificationPreference access patterns), 15.3 (notification integration tests).

Produce a spec, then implement lambdas/notifications/:

SQS trigger (batch size: 1). For each NEW_PIECE_PUBLISHED message:
1. Load ArtPiece + AuthorProfile from DynamoDB (verify ArtPiece still PUBLISHED + AuthorProfile ACTIVE)
2. Determine recipient set:
   - PUBLIC piece → query GSI-FollowersByAuthor for all followers
   - PRIVATE piece → query GSI-SubscribersByAuthor for all Author Subscribers (NOT followers — subscribers get notification regardless of follow status)
3. For each recipient: load NotificationPreference (PK=USER#{viewerId}, SK=NOTIF_PREF#AUTHOR#{authorId}) and ViewerProfile. Apply preference logic (resolveNotificationPref from shared package):
   - Global opt-out = true → skip
   - Per-author pref = NONE → skip
   - Per-author pref = PUBLIC_ONLY + piece is PRIVATE → skip
   - Otherwise → include in send batch
4. Build SES email from HTML + plain text template:
   - To: viewer email, From: no-reply@duseum.com
   - Subject: "New [public/exclusive] piece by {authorName}"
   - Body: piece thumbnail (PUBLIC only), title, excerpt (max 160 chars), piece URL, one-click unsubscribe link (generateUnsubscribeToken)
5. Send in batches of 50 via SES SendBulkEmail
6. On partial SES failure: log failed addresses, continue; do not re-queue entire job
7. After fan-out: DynamoDB UpdateItem ArtPiece.notifiedCount += successCount
8. On total failure: let SQS retry (up to 3x), then DLQ + CloudWatch alarm

Integration tests per Section 15.3 (fan-out-public, fan-out-private, fan-out-guard-rails, unsubscribe-token tests).
```

---

### PROMPT-4.4 — Collections CRUD ✅ Complete

```
Read CLAUDE.md. Read PROJECT.md Sections 2.6 (FR-COL-*), 8.5 (GET /authors/{authorId}/collections), 4.7 (Collection/CollectionItem table design).

Produce a spec, then add collection routes to artworks-lambda (or users-lambda per Section 4.2 — confirm which lambda owns /collections):

Routes (in artworks-lambda):
- POST /collections — create collection (Author only)
- GET /collections/{collectionId} — get collection + pieces (access-tier filtered)
- PUT /collections/{collectionId} — update metadata, visibility, display order
- DELETE /collections/{collectionId} — delete collection (does not delete pieces)
- POST /collections/{collectionId}/pieces — add piece to collection
- DELETE /collections/{collectionId}/pieces/{artworkId} — remove piece

Visibility rules: PRIVATE collections only visible to Author Subscribers. Piece count shown as "X pieces — Y visible to you."

Integration tests: create collection → add pieces → GET shows access-tier-filtered count.
```

---

### PROMPT-4.5 — Frontend: Social Features + Notifications UI ✅ Complete

```
Read CLAUDE.md. Read PROJECT.md Sections 8.7, 8.8, 13.3.

Produce a spec, then implement:

1. Art Piece Detail page — comment thread:
   - List comments (paginated, pinned comments first)
   - Post comment form (max 1000 chars, reply to comment)
   - Reaction bar (LOVE/WOW/FIRE/INSPIRED) with counts

2. Author Profile page:
   - Follow/Unfollow button with notification preference toggle ("Notify me: All pieces / Public only / None")
   - Collections list (access-tier filtered)

3. Notification preferences page (/settings/notifications):
   - Global opt-out toggle
   - Default pref selector
   - Per-Author overrides list (update or remove)

4. Unsubscribe landing page (/notifications/unsubscribe?token=...) — call GET /notifications/unsubscribe, show confirmation message or error

Test: follow Author → publish piece → SES email captured in MiniStack; click unsubscribe link → pref set to NONE.
```

---

## Stage 5 — Featured Authors

### PROMPT-5.1 — features-lambda (Daily Feature + Weekly Booking) ✅ Complete

```
Read CLAUDE.md. Read PROJECT.md Sections 2.11 (FR-FEAT-01 through FR-FEAT-18), 4.2, 8.9 (features API), 4.7 (DailyFeatureLog/WeeklyFeatureBooking table design), 15.3 (features-lambda integration tests).

Produce a spec, then implement lambdas/features/:

Routes:
- GET /features/daily — return today's DAILY_FEATURED_AUTHOR from config table with Author profile + spotlight pieces (FR-FEAT-07); 404 if not yet selected
- GET /features/weekly?week= — current or specified week's ACTIVE featured Authors (up to 10, order randomized per response per FR-FEAT-16)
- GET /features/weekly/availability — next 8 weeks booking calendar with slotsAvailable per week + feeFeeUsd from config table
- POST /features/weekly/book — Author only: eligibility check (3-month window via shared features package), slot availability check, create Stripe Payment Intent (metadata: type=WEEKLY_FEATURE, bookingId), create WeeklyFeatureBooking record (status=PENDING_PAYMENT); return stripeClientSecret
- GET /features/weekly/my-bookings — Author's booking history + nextEligibleWeek

All booking eligibility and slot-counting logic MUST come from packages/shared/src/features/. Do not implement inline.

Integration tests per Section 15.3 (book-weekly-feature, weekly-availability, daily-feature tests).
```

---

### PROMPT-5.2 — maintenance-lambda (Daily Selection + Weekly Rotation) ✅ Complete

```
Read CLAUDE.md. Read PROJECT.md Sections 4.2, 2.11 (FR-FEAT-01 through FR-FEAT-06, FR-FEAT-15), 4.7 (DailyFeatureLog, config table DAILY_FEATURED_AUTHOR, DAILY_FEATURED_EXCLUSIONS, WeeklyFeatureBooking GSI-WeeklyFeatureByStatus).

Produce a spec, then implement lambdas/maintenance/:

EventBridge handler with two task types detected from the rule name (event.resources[0]):

1. Daily task (cron 0 0 * * ? *):
   - Read DAILY_FEATURED_EXCLUSIONS from config table (last 7 authorIds)
   - Query all ACTIVE Author profiles with ≥1 PUBLIC piece
   - Exclude authorIds in exclusions list
   - Randomly select one Author
   - Write DAILY_FEATURED_AUTHOR to config table (authorId, selectedAt, selectionMethod=RANDOM)
   - Update DAILY_FEATURED_EXCLUSIONS: prepend new authorId, trim to 7 entries (FIFO)
   - Write DailyFeatureLog record (PK=FEATURE#DAILY, SK=DATE#{isoDate})

2. Weekly task (cron 0 0 ? * MON *):
   - Query GSI-WeeklyFeatureByStatus where featureStatus=CONFIRMED + isoWeek=currentWeek → set each to ACTIVE (record activatedAt)
   - Query GSI-WeeklyFeatureByStatus where featureStatus=ACTIVE + isoWeek=previousWeek → set each to ARCHIVED

3. Cleanup task (runs on daily schedule):
   - Delete PENDING/EXPIRED UploadIntent records older than 24 hours

Integration tests per Section 15.3 (daily-selection, weekly-rotation tests).
```

---

### PROMPT-5.3 — Admin Routes: Feature Management ✅ Complete

```
Read CLAUDE.md. Read PROJECT.md Sections 2.10 (FR-ADMIN-04/05/06/07), 8.10 (admin API — feature routes), 4.2 (admin-lambda).

Produce a spec, then add to lambdas/admin/:

Routes:
- PUT /admin/features/daily/override — Admin overrides Daily Featured Author (FR-FEAT-06); writes DAILY_FEATURED_AUTHOR with selectionMethod=ADMIN_OVERRIDE + overriddenBy; logs override
- DELETE /admin/features/weekly/bookings/{bookingId} — Admin cancels booking + issues full Stripe refund (FR-ADMIN-07); sets status=CANCELLED; frees slot; logs reason
- GET /admin/features/weekly — list all weekly feature bookings with filters (week, status, pagination)

All booking logic reads from packages/shared. Admin-lambda never reimplements eligibility or slot counting.

Integration tests: override correctly updates config; cancellation sets CANCELLED + frees slot count; non-admin gets 403.
```

---

### PROMPT-5.4 — Frontend: Featured Authors + Booking UI ✅ Complete

```
Read CLAUDE.md. Read PROJECT.md Sections 8.9, 2.11, 13.3.

Produce a spec, then implement:

1. Homepage — finalize with live data:
   - Daily Featured Author spotlight: cover photo, bio excerpt, pinned pieces, Follow/Subscribe CTAs
   - Weekly Featured Authors carousel: up to 10 Authors, randomized display order, each with 2 recent pieces

2. Author Dashboard — Weekly Feature booking:
   - Availability calendar (8 weeks ahead): slots remaining per week, unavailable weeks greyed out
   - Book a week CTA: Stripe Payment Element (client secret from POST /features/weekly/book)
   - Booking confirmation page
   - Booking history table (isoWeek, status, amountPaid, nextEligibleWeek)

3. Admin Panel — Feature management:
   - Daily Featured Author override form
   - Weekly bookings table with cancel + refund action

Test: full booking flow with Stripe test card; Monday rotation manually triggered → Author appears on homepage.
```

---

## Stage 6 — Admin, Monitoring & Production Readiness

### PROMPT-6.1 — admin-lambda (User & Content Management) ✅ Complete

```
Read CLAUDE.md. Read PROJECT.md Sections 2.10 (FR-ADMIN-01 through FR-ADMIN-06), 8.10 (admin API), 4.2.

Produce a spec, then implement lambdas/admin/:

Routes:
- GET /admin/users — list all users with filters (status, email search, pagination)
- PUT /admin/users/{userId}/suspend — suspend user account (disables all profiles)
- PUT /admin/users/{userId}/reinstate — reinstate user account
- PUT /admin/users/{userId}/profiles/{profileType}/suspend — suspend individual profile
- DELETE /admin/artworks/{artworkId} — remove art piece (policy violation); soft delete + S3 cleanup
- DELETE /admin/comments/{commentId} — hide comment
- PUT /admin/config — update platform config values in DynamoDB config table (freeTierLimit, platformSubPriceId, platformCutPercent, weeklyFeatureFeeUsd, weeklyFeatureSlotCount)
- GET /admin/dashboard — aggregate stats: total users, active platform subs, author subs, MRR (7d/30d signups), DLQ depths, upcoming weekly features

All routes require ADMIN Cognito group membership (checked in cognitoAuthMiddleware by reading groups from JWT).

Integration tests: non-admin gets 403 on all routes; suspend user → profiles suspended; config update → config table updated.
```

---

### PROMPT-6.2 — MonitoringStack CDK ✅ Complete

```
Read CLAUDE.md. Read PROJECT.md Sections 5.2 (MonitoringStack), 3.5 (NFR-OBS-01 through NFR-OBS-04), 13.4 (CDK conventions).

Produce a spec, then implement infrastructure/stacks/monitoring-stack.ts:

1. CloudWatch Dashboard: API request volume, Lambda error rates, Lambda durations (P50/P95/P99), DynamoDB consumed capacity, SQS queue depth (webhook + notification), DLQ depths
2. CloudWatch Alarms:
   - Lambda error rate > 1% (all 11 Lambdas) → SNS admin alerts topic
   - SQS DLQ message count > 0 (webhook DLQ + notification DLQ) → SNS admin alerts topic
   - API Gateway 5xx rate > 1% → SNS admin alerts topic
3. X-Ray groups for each Lambda function (to enable service map in X-Ray console)
4. Add MonitoringStack to DuseumStage as final stack (depends on ApiStack)

Verify: cdk synth --strict passes; dashboard visible in AWS console after deploy.
```

---

### PROMPT-6.3 — GitHub Actions CI/CD Workflows ✅ Complete

```
Read CLAUDE.md. Read PROJECT.md Sections 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 11.3 (OIDC bootstrap).

Produce a spec, then implement all GitHub Actions workflows:

1. .github/workflows/ci.yml — PR checks: lint + typecheck (all workspaces, parallel), unit tests (packages/shared + lambdas + frontend), integration tests (MiniStack via service container), CDK synth validate (both envs), frontend build validate

2. .github/workflows/_build-lambdas.yml — reusable: build all Lambda ZIPs with esbuild (tree-shaken, bundled, minified, ARM64 target), upload to S3 artifact bucket duseum-dev-lambda-artifacts at {sha}/{name}/function.zip

3. .github/workflows/_cdk-deploy.yml — reusable: npm ci → configure AWS OIDC → cdk deploy --all --context env={env} --context sha={sha} --require-approval never

4. .github/workflows/deploy-dev.yml — push to develop: ci → build → deploy dev → smoke test

5. .github/workflows/deploy-prod.yml — push tag v*.*.*: ci → build → deploy prod (pauses at GitHub Environment "prod" for manual approval) → smoke test

6. infrastructure/stacks/oidc-stack.ts — CDK stack that creates GitHub Actions OIDC provider + IAM roles for deploy-dev and deploy-prod (scoped to repo ryanwaite28/ai-projects-duseum). Deploy this stack manually once: cdk deploy OidcStack --context env=dev

Note: Single AWS account 408141212087 is used for both environments. OIDC role has permission to deploy both dev and prod stacks. Tag resources with Environment={env} to maintain logical separation.

7. scripts/smoke-test.sh — post-deploy verification: health check all Lambda endpoints, verify DynamoDB tables exist, verify CloudFront distributions active

Verify: push to develop branch triggers deploy-dev.yml successfully.
```

---

### PROMPT-6.4 — Admin Frontend Panel ✅ Complete

```
Read CLAUDE.md. Read PROJECT.md Sections 8.10, 2.10, 13.3.

Produce a spec, then implement the admin panel in the React frontend (route-guarded to ADMIN Cognito group):

1. /admin/dashboard — stats overview (total users, active subs, MRR, DLQ depths, upcoming weekly features)
2. /admin/users — paginated user table with search, suspend/reinstate actions
3. /admin/content — flagged art pieces list, remove action
4. /admin/config — platform config form (free tier limit, subscription price ID, weekly feature fee, slot count)
5. /admin/features — daily override form + weekly bookings table with cancel/refund action

Test: admin-only routes redirect non-admins to 403 page.
```

---

### PROMPT-6.5 — Author Dashboard (Full Analytics) ✅ Complete

```
Read CLAUDE.md. Read PROJECT.md Sections 2.4 (FR-AUTH-PROF-06), 8.4 (PUT /users/me/author), 8.6 (GET /subscriptions/me).

Produce a spec, then finalize the Author dashboard:

1. /dashboard/author — overview: total views (aggregate across pieces), follower count, subscriber count, revenue (MRR from Stripe, all-time)
2. Piece management table: all pieces with status, view count, notifiedCount, edit/archive/delete actions
3. Collections management: create/edit/delete collections, drag-and-drop piece ordering
4. Pinned pieces: select up to 3 pieces to pin to public gallery top
5. Subscription analytics: subscriber count history, churn rate (from Stripe), revenue breakdown
6. Feature booking history tab (reused from PROMPT-5.4)
7. Notification delivery summary: per-piece notifiedCount, shown asynchronously

Test: Author dashboard shows live data; piece management CRUD works end-to-end.
```

---

### PROMPT-6.6 — Performance Validation & Production Go-Live ✅ Complete

```
Read CLAUDE.md. Read PROJECT.md Sections 3.1 (NFR-PERF-*), 11.7 (production go-live checklist), 9.5 (smoke tests), 11.5 (CDK deploy commands).

Produce a spec for the following manual + automated validation steps. This prompt is primarily for documentation and checklist generation — not code generation.

Generate:
1. scripts/load-test.sh — Artillery or k6 script: 100 concurrent users, 5-minute ramp, hitting GET /artworks + GET /artworks/{id} + GET /features/daily. Assert P95 < 2s (NFR-PERF-01) and Lambda cold start < 1s (NFR-PERF-03).

2. Production go-live checklist (verify all items from Section 11.7 are complete):
   - SES production access approved
   - Stripe live mode sk_live_ stored in prod Secrets Manager
   - Stripe live webhook endpoint configured to prod API Gateway URL
   - ACM certificate ISSUED
   - All SSM parameters present for prod
   - CDK deploy prod completed
   - Smoke tests passing
   - CloudFront signed URL end-to-end tested (private piece)
   - Stripe webhook test event processed
   - Billing alerts configured ($50/$200 thresholds on account 408141212087)

3. Tag v1.0.0 and push — deploy-prod.yml triggers with manual approval gate.
```

---

## Appendix: Spec Template (copy-paste)

```
## Spec: {Task Name}

**Relevant PROJECT.md sections**: {e.g. 4.2, 8.2, 6.5}

**What this implements**: {1–2 sentences}

**New/modified files**:
- lambdas/{name}/src/routes/{file}.ts — {purpose}
- packages/shared/src/db/{entity}.repository.ts — {new functions}
- infrastructure/stacks/{stack}.ts — {new resources if any}

**DynamoDB access patterns used**:
- {entity} by {key}: {GSI name or PK/SK pattern}

**Business logic**:
1. {step}
2. {step}
- Error: {condition} → {HTTP status + code}

**Tests to write**:
- Unit: {what}
- Integration: {what}
```
