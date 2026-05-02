## Spec: Environment Bootstrap — Runtime Data Prerequisites

**Status**: ✅ Implemented (dev + prod seeded 2026-05-02)
**Relevant PROJECT.md sections**: §4.7 (config table), §5.4 (SSM), §10.3 (Secrets Manager), §8.6 (platform subscription)

**What this documents**: Everything that must exist at runtime — beyond what CDK deploys — for each environment to be fully functional. CDK creates the AWS resources (tables, queues, buckets). This spec documents what data must be seeded into those resources, and what external service objects (Stripe products/prices) must be created before features that depend on them work.

> **Rule**: Any spec that introduces a new config table key, a new Stripe resource dependency, or a new Secrets Manager secret must update this document and add a done-when item for seeding both dev and prod.

---

## Why This Document Exists

Three categories of dependencies exist for any deployed feature:

| Category | Managed by | Examples |
|---|---|---|
| Code dependencies | npm / TypeScript | imports, packages |
| Infrastructure dependencies | CDK | DynamoDB tables, S3 buckets, Lambda functions |
| **Runtime data dependencies** | **Manual / bootstrap** | **Config table rows, Stripe product IDs, Secrets** |

Only the first two are verified by CI/CD. Runtime data dependencies are invisible to code review and typecheck — a feature can pass all tests locally (MiniStack seeds its own config rows) and fail in production with a misleading error because the live config table was never seeded.

---

## Config Table — `duseum-{env}-dynamodb-config`

Key schema: `PK` (string, no SK). Written by `setConfigValue()` in `config.repository.ts`. Read by `getConfigNumber()` and `getConfigValue()`.

| PK | Type | Dev value | Prod value | Required by |
|---|---|---|---|---|
| `PLATFORM_SUB_PRICE_ID` | string | `price_1TMYgkDeejIUwJISc1SBdOXV` | `price_1TSdktRUKQLlSd6o4QGRZnOp` | `POST /subscriptions/platform` |
| `PLATFORM_CUT_PERCENT` | number | `20` | `20` | `POST /subscriptions/authors/{id}` |
| `FREE_TIER_LIMIT` | number | `5` | `5` | `GET /artworks` (tier enforcement) |
| `WEEKLY_FEATURE_FEE_USD` | number | `50` | `50` | `POST /features/weekly/book` |
| `WEEKLY_FEATURE_SLOT_COUNT` | number | `3` | `3` | `GET /features/weekly/availability` |
| `WEEKLY_FEATURE_ADVANCE_WEEKS` | number | `3` | `3` | `GET /features/weekly/availability` |

### Seeding commands

Replace `{env}` with `dev` or `prod`:

```bash
# PLATFORM_SUB_PRICE_ID — update value with the correct Stripe Price ID for the environment
aws dynamodb put-item --profile rmw-llc --region us-east-1 \
  --table-name duseum-{env}-dynamodb-config \
  --item '{"PK":{"S":"PLATFORM_SUB_PRICE_ID"},"value":{"S":"price_xxxxx"}}'

aws dynamodb put-item --profile rmw-llc --region us-east-1 \
  --table-name duseum-{env}-dynamodb-config \
  --item '{"PK":{"S":"PLATFORM_CUT_PERCENT"},"value":{"N":"20"}}'

aws dynamodb put-item --profile rmw-llc --region us-east-1 \
  --table-name duseum-{env}-dynamodb-config \
  --item '{"PK":{"S":"FREE_TIER_LIMIT"},"value":{"N":"5"}}'

aws dynamodb put-item --profile rmw-llc --region us-east-1 \
  --table-name duseum-{env}-dynamodb-config \
  --item '{"PK":{"S":"WEEKLY_FEATURE_FEE_USD"},"value":{"N":"50"}}'

aws dynamodb put-item --profile rmw-llc --region us-east-1 \
  --table-name duseum-{env}-dynamodb-config \
  --item '{"PK":{"S":"WEEKLY_FEATURE_SLOT_COUNT"},"value":{"N":"3"}}'

aws dynamodb put-item --profile rmw-llc --region us-east-1 \
  --table-name duseum-{env}-dynamodb-config \
  --item '{"PK":{"S":"WEEKLY_FEATURE_ADVANCE_WEEKS"},"value":{"N":"3"}}'
```

Config values can also be updated via the admin API (requires admin user account):
```bash
curl -X PUT https://api.{env}.duseum.com/admin/config \
  -H "Authorization: Bearer {admin-token}" \
  -H "Content-Type: application/json" \
  -d '{"platformSubPriceId":"price_xxxxx","platformCutPercent":20}'
```

### Verification

```bash
aws dynamodb scan --profile rmw-llc --region us-east-1 \
  --table-name duseum-{env}-dynamodb-config \
  --query "Items[*].{Key:PK.S,Value:value.S,ValueN:value.N}" \
  --output table
```

---

## Stripe — Platform Subscription Product and Price

Each environment has its own Stripe account (see CLAUDE.md Stripe Reference). The platform subscription product and price must be created in each account independently.

| Env | Stripe Account | Product ID | Price ID | Amount |
|---|---|---|---|---|
| dev | `acct_1TMYUPDeejIUwJIS` | `prod_ULFBXnQSuGApqJ` | `price_1TMYgkDeejIUwJISc1SBdOXV` | $10.00/month |
| prod | `acct_1TMYUIRUKQLlSd6o` | `prod_URWopE8gA1XDQT` | `price_1TSdktRUKQLlSd6o4QGRZnOp` | $10.00/month |

### Creating a new platform subscription product + price (if needed)

```bash
STRIPE_KEY=$(aws secretsmanager get-secret-value \
  --profile rmw-llc --region us-east-1 \
  --secret-id "duseum/{env}/stripe/secret-key" \
  --query "SecretString" --output text)

# 1. Create product
PRODUCT=$(curl -s -X POST "https://api.stripe.com/v1/products" \
  -u "${STRIPE_KEY}:" \
  -d "name=Platform Subscription" \
  -d "description=Duseum platform membership — unlimited access to all artworks")
PRODUCT_ID=$(echo $PRODUCT | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")

# 2. Create monthly price
PRICE=$(curl -s -X POST "https://api.stripe.com/v1/prices" \
  -u "${STRIPE_KEY}:" \
  -d "product=${PRODUCT_ID}" \
  -d "unit_amount=1000" \
  -d "currency=usd" \
  -d "recurring[interval]=month")
PRICE_ID=$(echo $PRICE | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")

echo "Price ID: ${PRICE_ID}"
# Then seed PLATFORM_SUB_PRICE_ID with this price ID
```

---

## Secrets Manager — Required Secrets

All secrets are pre-seeded. Listed here for bootstrap verification only.

| Secret ID (dev) | Secret ID (prod) | Content |
|---|---|---|
| `duseum/dev/stripe/secret-key` | `duseum/prod/stripe/secret-key` | Stripe secret key (`sk_test_...` / `sk_live_...`) |
| `duseum/dev/stripe/webhook-secret` | `duseum/prod/stripe/webhook-secret` | Connect webhook signing secret (`whsec_...`) |
| `duseum/dev/stripe/webhook-secret-account` | `duseum/prod/stripe/webhook-secret-account` | Account webhook signing secret (`whsec_...`) |
| `duseum/dev/stripe/connect-client-id` | `duseum/prod/stripe/connect-client-id` | Stripe Connect Express client ID (`ca_...`) |
| `duseum/dev/cloudfront/private-key` | `duseum/prod/cloudfront/private-key` | RSA private key for CloudFront signed URLs |
| `duseum/dev/notifications/unsubscribe-secret` | `duseum/prod/notifications/unsubscribe-secret` | HMAC secret for one-click unsubscribe tokens |
| `duseum/dev/ses/from-address` | `duseum/prod/ses/from-address` | SES from address (`no-reply@duseum.com`) |

### Verification

```bash
aws secretsmanager list-secrets \
  --profile rmw-llc --region us-east-1 \
  --filters Key=name,Values=duseum/{env} \
  --query "SecretList[].Name" --output table
```

---

## Checklist — New Environment Bootstrap Order

Run this sequence when setting up a fresh environment (e.g., a future `staging`):

1. `cdk deploy --all` — creates all AWS resources
2. Create Stripe product and price in the environment's Stripe account
3. Seed all config table keys (commands above)
4. Verify Secrets Manager secrets are present and non-empty
5. Run `/env-health {env}` to confirm all checks pass
6. Run smoke tests: create user → subscribe to platform → verify checkout URL returned

---

## Done-when checklist

- [x] All 6 config keys seeded in dev (2026-05-02)
- [x] All 6 config keys seeded in prod (2026-05-02)
- [x] Stripe platform subscription product + price created in dev (pre-existing: `price_1TMYgkDeejIUwJISc1SBdOXV`)
- [x] Stripe platform subscription product + price created in prod (created 2026-05-02: `price_1TSdktRUKQLlSd6o4QGRZnOp`)
- [x] All Secrets Manager secrets present in dev + prod
- [x] `/env-health` command created in `.claude/commands/env-health.md`
- [x] Bootstrap spec linked from `specs/infrastructure/` directory
