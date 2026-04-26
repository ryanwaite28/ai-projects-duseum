# Duseum — Phase 0 Setup Manual

> Manual and semi-automated steps required before any CDK deploy. Complete all phases in order. Phases marked ✅ are already done.

**AWS Account**: `408141212087` (shared dev + prod)  
**AWS CLI Profile**: `rmw-llc` — use `--profile rmw-llc` on all CLI commands  
**SSO login**: `aws sso login --profile rmw-llc`

---

## Phase 0.1 — Stripe Account Setup ✅

Two separate Stripe accounts — one per environment:

| Env | Account ID | Connect Client ID | Webhook Destination ID |
|---|---|---|---|
| dev | `acct_1TMYUPDeejIUwJIS` | `ca_ULF5h4bUlGnwEo3YRUioqoI8hogxwvcb` | `we_1TMiBcDeejIUwJISRTd0wITw` |
| prod | `acct_1TMYUIRUKQLlSd6o` | `ca_ULF9jsCeRlmkF08gQBXwDqivNgiw38lA` | `we_1TMiH8RUKQLlSd6oP9UMFQ3C` |

Webhook endpoints:
- Dev: `https://api.dev.duseum.com/webhooks/stripe`
- Prod: `https://api.prod.duseum.com/webhooks/stripe`

All Stripe secrets stored in Secrets Manager (see Phase 0.4). **Do not recreate these webhook endpoints in CDK — they are pre-provisioned.**

Subscribed events (in addition to PROJECT.md base events):
`customer.subscription.paused`, `customer.subscription.resumed`, `invoice.payment_succeeded`, `subscription_schedule.*`, `customer.subscription.trial_will_end`, `account.updated`

---

## Phase 0.2 — GitHub Repository Settings ✅

GitHub environment secrets are configured for `dev` and `prod` environments. Workflow pattern:

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
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: us-east-1
```

| Secret | Value |
|---|---|
| `AWS_ROLE_ARN` (dev env) | `arn:aws:iam::408141212087:role/duseum-github-actions-deploy-dev` |
| `AWS_ROLE_ARN` (prod env) | `arn:aws:iam::408141212087:role/duseum-github-actions-deploy-prod` |
| `CLOUDFRONT_KEYPAIR_ID` (dev env) | `K1WIG6RJRFSB4I` |
| `CLOUDFRONT_KEYPAIR_ID` (prod env) | `K39EZRF2L5JQV2` |

---

## Phase 0.3 — OIDC + IAM Deploy Roles ✅

Provisioned by `bash scripts/bootstrap.sh`. Resources created:

- OIDC provider: `arn:aws:iam::408141212087:oidc-provider/token.actions.githubusercontent.com`
- IAM role `duseum-github-actions-deploy-dev` — trust scoped to `repo:ryanwaite28/ai-projects-duseum:environment:dev`
- IAM role `duseum-github-actions-deploy-prod` — trust scoped to `repo:ryanwaite28/ai-projects-duseum:environment:prod`
- CDK bootstrap: `duseum-cdk-toolkit` stack in `aws://408141212087/us-east-1`

To re-bootstrap if needed:
```bash
aws sso login --profile rmw-llc
cdk bootstrap aws://408141212087/us-east-1 --profile rmw-llc --toolkit-stack-name duseum-cdk-toolkit
```

---

## Phase 0.4 — Secrets Manager + SSM Seed ✅

All secrets and SSM parameters provisioned. To verify:

```bash
aws sso login --profile rmw-llc

# Verify dev Stripe secrets exist
aws secretsmanager describe-secret --name duseum/dev/stripe/secret-key --profile rmw-llc
aws secretsmanager describe-secret --name duseum/dev/stripe/webhook-secret --profile rmw-llc
aws secretsmanager describe-secret --name duseum/dev/stripe/connect-client-id --profile rmw-llc

# Verify dev SSM params
aws ssm get-parameter --name /duseum/dev/stripe/publishable_key --profile rmw-llc
aws ssm get-parameter --name /duseum/dev/cloudfront/key_pair_id --profile rmw-llc
```

### Secret paths convention

Secrets Manager (sensitive values — never in env vars or code):
```
duseum/{env}/stripe/secret-key
duseum/{env}/stripe/webhook-secret
duseum/{env}/stripe/connect-client-id
duseum/{env}/cloudfront/private-key
duseum/{env}/ses/from-address
duseum/{env}/notifications/unsubscribe-secret
```

SSM Parameter Store (non-secret references):
```
/duseum/{env}/stripe/publishable_key
/duseum/{env}/cloudfront/key_pair_id
/duseum/{env}/stacks/storage/dynamodb_main_table_name
/duseum/{env}/stacks/storage/dynamodb_idempotency_table_name
/duseum/{env}/stacks/storage/dynamodb_config_table_name
/duseum/{env}/stacks/storage/s3_media_bucket_name
/duseum/{env}/stacks/auth/cognito_user_pool_id
/duseum/{env}/stacks/auth/cognito_client_id
/duseum/{env}/stacks/messaging/sqs_stripe_webhook_queue_url
/duseum/{env}/stacks/messaging/sqs_notifications_queue_url
/duseum/{env}/stacks/cdn/cloudfront_media_domain
/duseum/{env}/config/free_tier_piece_limit           (default: 10)
/duseum/{env}/config/author_revenue_cut_percent      (default: 20)
/duseum/{env}/config/weekly_feature_fee_cents        (default: 2500)
/duseum/{env}/config/weekly_feature_max_slots        (default: 10)
/duseum/{env}/config/platform_subscription_price_id  (Stripe price ID)
```

### Generating a CloudFront key pair (if needed)

```bash
# Generate RSA key pair
openssl genrsa -out /tmp/duseum-{env}-cf-private.pem 2048
openssl rsa -pubout -in /tmp/duseum-{env}-cf-private.pem -out /tmp/duseum-{env}-cf-public.pem

# Upload public key to CloudFront — note the returned "Id" (KeyPairId)
aws cloudfront create-public-key \
  --public-key-config '{
    "CallerReference": "duseum-{env}-cf-key-1",
    "Name": "duseum-{env}-cloudfront-signed-url-key",
    "EncodedKey": "'"$(cat /tmp/duseum-{env}-cf-public.pem)"'",
    "Comment": "Duseum {env} CloudFront signed URL key"
  }' \
  --profile rmw-llc

# Store private key in Secrets Manager
aws secretsmanager create-secret \
  --name duseum/{env}/cloudfront/private-key \
  --secret-string "$(cat /tmp/duseum-{env}-cf-private.pem)" \
  --tags Key=Project,Value=duseum Key=Environment,Value={env} \
  --profile rmw-llc

# Store key pair ID in SSM
aws ssm put-parameter \
  --name /duseum/{env}/cloudfront/key_pair_id \
  --value "REPLACE_WITH_ID_FROM_ABOVE" \
  --type String \
  --tags Key=Project,Value=duseum Key=Environment,Value={env} \
  --profile rmw-llc

# Clean up local files
rm /tmp/duseum-{env}-cf-private.pem /tmp/duseum-{env}-cf-public.pem
```

---

## Phase 0.5 — AWS Billing Alerts ⬜ Pending

Manually configure in AWS Console → Billing → Budgets:

1. Budget #1: $50/month → email alert → ryanwaite28@gmail.com
2. Budget #2: $200/month → email alert → ryanwaite28@gmail.com

These apply to the entire account `408141212087`.

---

## Phase 0.6 — Pre-Provisioned Infrastructure (reference only, do NOT recreate)

| Resource | How to reference in CDK |
|---|---|
| Route53 hosted zone for `duseum.com` | `HostedZone.fromLookup(this, 'Zone', { domainName: 'duseum.com' })` |
| ACM certificates (us-east-1) | `Certificate.fromCertificateArn(this, 'Cert', certArn)` — ARN from SSM/context |
| SES domain verification | No CDK action needed — already verified |
| SES email identity `no-reply@duseum.com` | No CDK action needed |
| Stripe webhook endpoints | Do NOT recreate — pre-provisioned (see Phase 0.1) |

---

## Local Development Setup

### Prerequisites

- Node.js 20+, npm 10+
- Docker (Colima recommended on macOS)
- MiniStack (`nahuelnucera/ministack`) for local AWS emulation

### Start MiniStack

```bash
# Start Colima (run manually in terminal — not via script)
colima start

# Start MiniStack container
docker run -d \
  --name ministack \
  -p 4566:4566 \
  nahuelnucera/ministack

# Verify
aws --endpoint-url http://localhost:4566 s3 ls
```

### Run tests

```bash
npm install
# Run all tests (requires MiniStack running)
npm run test --workspaces

# Run specific lambda tests
npm run test -w lambdas/subscriptions-webhook
```

### CDK deploy (dev)

```bash
aws sso login --profile rmw-llc
cd infrastructure
npx cdk synth --strict --context env=dev
npx cdk deploy --all --context env=dev --profile rmw-llc
```

---

## Known Issues / Pre-Deploy Checklist

Before tagging `v1.0.0` and deploying to prod, verify:

- [ ] `APP_BASE_URL` added to `commonEnv` in `infrastructure/stacks/api-stack.ts` — needed for Stripe Connect redirect URLs
- [ ] `connect-status.ts` `detailsSubmitted` field fix — currently uses `connectChargesEnabled` for both fields; should cache `connectDetailsSubmitted` separately or always call Stripe
- [ ] `account.updated` subscribed in Stripe dashboard for both dev and prod webhook endpoints
- [ ] `GET /collections/{collectionId}/pieces` auth set to `NONE` in api-stack (handler enforces privacy internally)
- [ ] `lambdas/subscriptions-webhook/src/ingress.ts` stub implemented (if used as API Gateway entry point)
- [ ] Billing alerts configured (Phase 0.5)
- [ ] All integration tests pass with MiniStack
- [ ] CDK synth passes with zero warnings (`cdk synth --strict --context env=prod`)
