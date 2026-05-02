# /env-health

**Environment Health Check — verifies all runtime data dependencies are present in dev and prod.**

Invoke this when a feature is unexpectedly broken in a live environment, before concluding there is a code bug. Runtime data dependencies (config table keys, Stripe resources) are not deployed by CDK and must be seeded manually. This command surfaces missing data before it becomes a debugging rabbit hole.

---

## What This Checks

### 1. DynamoDB config table — required keys

Every key listed in `specs/infrastructure/environment-bootstrap.md` must be present with a non-empty value. A missing or empty key means the feature that reads it will fail at runtime, often with a misleading "not configured" or "not found" error that looks like a code bug.

Run for each environment:

```bash
aws dynamodb scan \
  --profile rmw-llc \
  --region us-east-1 \
  --table-name duseum-{env}-dynamodb-config \
  --query "Items[*].{Key:PK.S,Value:value.S,ValueN:value.N}" \
  --output table
```

Expected keys: `PLATFORM_SUB_PRICE_ID`, `PLATFORM_CUT_PERCENT`, `FREE_TIER_LIMIT`, `WEEKLY_FEATURE_FEE_USD`, `WEEKLY_FEATURE_SLOT_COUNT`, `WEEKLY_FEATURE_ADVANCE_WEEKS`

### 2. Secrets Manager — required secrets

All secrets must exist and have non-empty `SecretString` values:

```bash
aws secretsmanager list-secrets \
  --profile rmw-llc \
  --region us-east-1 \
  --filters Key=name,Values=duseum/{env} \
  --query "SecretList[].Name" \
  --output table
```

Expected: `duseum/{env}/stripe/secret-key`, `duseum/{env}/stripe/webhook-secret`, `duseum/{env}/stripe/webhook-secret-account`, `duseum/{env}/stripe/connect-client-id`, `duseum/{env}/cloudfront/private-key`, `duseum/{env}/notifications/unsubscribe-secret`, `duseum/{env}/ses/from-address`

### 3. Stripe — platform subscription product and price

The `PLATFORM_SUB_PRICE_ID` in the config table must reference an active Stripe Price in the correct Stripe account for that environment. Verify:

```bash
STRIPE_KEY=$(aws secretsmanager get-secret-value \
  --profile rmw-llc --region us-east-1 \
  --secret-id "duseum/{env}/stripe/secret-key" \
  --query "SecretString" --output text)

# Verify the price ID stored in config actually exists and is active in Stripe
PRICE_ID=$(aws dynamodb get-item \
  --profile rmw-llc --region us-east-1 \
  --table-name duseum-{env}-dynamodb-config \
  --key '{"PK":{"S":"PLATFORM_SUB_PRICE_ID"}}' \
  --query "Item.value.S" --output text)

curl -s "https://api.stripe.com/v1/prices/${PRICE_ID}" \
  -u "${STRIPE_KEY}:" | python3 -c "
import json, sys
p = json.load(sys.stdin)
print('Price ID:', p.get('id', 'NOT FOUND'))
print('Active:', p.get('active'))
print('Amount:', p.get('unit_amount'))
print('Interval:', p.get('recurring', {}).get('interval'))
"
```

---

## Output Format

For each environment checked, produce a table:

```
══════════════════════════════════════════════
  ENV HEALTH — {env}
══════════════════════════════════════════════

CONFIG TABLE
  ✅ PLATFORM_SUB_PRICE_ID  = price_xxxxx
  ✅ PLATFORM_CUT_PERCENT   = 20
  ✅ FREE_TIER_LIMIT        = 5
  ✅ WEEKLY_FEATURE_FEE_USD = 50
  ✅ WEEKLY_FEATURE_SLOT_COUNT    = 3
  ✅ WEEKLY_FEATURE_ADVANCE_WEEKS = 3
  ❌ {key} — MISSING

SECRETS MANAGER
  ✅ duseum/{env}/stripe/secret-key
  ✅ duseum/{env}/stripe/webhook-secret
  ❌ duseum/{env}/stripe/webhook-secret-account — MISSING

STRIPE
  ✅ price_xxxxx — active, $10.00/month

VERDICT: ✅ Healthy | ⚠️ {N} issues found
══════════════════════════════════════════════
```

If any item is missing or incorrect, print the exact CLI command to fix it (from `specs/infrastructure/environment-bootstrap.md`).

---

## Usage

```
/env-health          — check both dev and prod
/env-health dev      — check dev only
/env-health prod     — check prod only
```

When invoked, run the checks above for the specified environment(s), using the `rmw-llc` AWS CLI profile. If SSO is expired, print the login command first: `aws sso login --profile rmw-llc`.
