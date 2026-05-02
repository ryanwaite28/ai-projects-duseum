#!/usr/bin/env bash
# =============================================================================
# scripts/dep-check.sh — Runtime dependency health check (read-only)
#
# Verifies that all runtime data dependencies are present and correctly seeded
# after CDK deploy. Runs in the pipeline between Deploy Frontend and Smoke Test;
# a failure here means smoke tests will fail with misleading errors — this gives
# the operator the real cause and the exact fix.
#
# SMART logic: distinguishes three different failure modes:
#   (1) Config table missing      → CDK deploy failed or hasn't run yet
#   (2) Table exists, key missing → bootstrap.sh not run after CDK deploy
#   (3) Placeholder value         → bootstrap.sh ran but Stripe step incomplete
#
# Exit 0 = all dependencies present and correctly seeded
# Exit 1 = one or more missing or incorrect
#
# Usage (CI):    bash scripts/dep-check.sh <dev|prod>
# Usage (local): bash scripts/dep-check.sh <dev|prod>   (needs aws credentials)
#                Alias: /env-health — see .claude/commands/env-health.md
#
# Sync rule: when a new config key is added, update REQUIRED_KEYS below AND
# scripts/bootstrap.sh. See CLAUDE.md — "new runtime data dependency" rule.
# =============================================================================

set -uo pipefail

ENV="${1:-}"
if [[ -z "$ENV" || ("$ENV" != "dev" && "$ENV" != "prod") ]]; then
  echo "Usage: $0 <dev|prod>" >&2
  exit 1
fi

FAILURES=0
CONFIG_TABLE="duseum-${ENV}-dynamodb-config"

# ── Colour helpers ─────────────────────────────────────────────────────────────
pass() { echo "  ✅ $1"; }
fail() { echo "  ❌ $1" >&2; FAILURES=$((FAILURES + 1)); }
section() { echo ""; echo "$1"; }

echo "══════════════════════════════════════════════════════"
echo "  RUNTIME DEPENDENCY CHECK — ${ENV}"
echo "══════════════════════════════════════════════════════"

# ── 1. Config table: smart existence check first ──────────────────────────────
section "CONFIG TABLE  (${CONFIG_TABLE})"

TABLE_STATUS=$(aws dynamodb describe-table \
  --region us-east-1 \
  --table-name "$CONFIG_TABLE" \
  --query "Table.TableStatus" \
  --output text 2>/dev/null || echo "NOT_FOUND")

if [[ "$TABLE_STATUS" == "NOT_FOUND" ]]; then
  fail "CONFIG TABLE MISSING: ${CONFIG_TABLE} does not exist"
  echo "       → CDK deploy may not have completed. Check the Deploy job." >&2
  echo "       → If this is a new environment, run: cdk deploy --all" >&2
  # Skip per-key checks — table doesn't exist, all would fail
else
  # Table exists — check each required key
  # When adding a new config key: add it here AND in bootstrap.sh Section 3.6/8
  REQUIRED_KEYS=(
    PLATFORM_SUB_PRICE_ID
    PLATFORM_CUT_PERCENT
    FREE_TIER_LIMIT
    WEEKLY_FEATURE_FEE_USD
    WEEKLY_FEATURE_SLOT_COUNT
    WEEKLY_FEATURE_ADVANCE_WEEKS
  )

  for KEY in "${REQUIRED_KEYS[@]}"; do
    ITEM=$(aws dynamodb get-item \
      --region us-east-1 \
      --table-name "$CONFIG_TABLE" \
      --key "{\"PK\":{\"S\":\"${KEY}\"}}" \
      --query "Item.value" \
      --output json 2>/dev/null || echo "null")

    if [[ "$ITEM" == "null" || -z "$ITEM" ]]; then
      fail "${KEY} — MISSING  → run: bash scripts/bootstrap.sh"
    else
      VALUE=$(echo "$ITEM" | python3 -c \
        "import json,sys; v=json.load(sys.stdin); print(v.get('S') or v.get('N',''))" \
        2>/dev/null || echo "")

      if [[ -z "$VALUE" ]]; then
        fail "${KEY} — EMPTY  → run: bash scripts/bootstrap.sh"
      elif [[ "$KEY" == "PLATFORM_SUB_PRICE_ID" && "$VALUE" == "REPLACE_WITH_STRIPE_PRICE_ID" ]]; then
        fail "${KEY} = placeholder — bootstrap.sh Section 3.7 (Stripe provisioning) not completed"
        echo "       → run: bash scripts/bootstrap.sh  (re-run is idempotent)" >&2
      else
        pass "${KEY} = ${VALUE}"
      fi
    fi
  done
fi

# ── 2. Secrets Manager secrets ────────────────────────────────────────────────
section "SECRETS MANAGER  (duseum/${ENV}/...)"

REQUIRED_SECRETS=(
  "duseum/${ENV}/stripe/secret-key"
  "duseum/${ENV}/stripe/webhook-secret"
  "duseum/${ENV}/stripe/webhook-secret-account"
  "duseum/${ENV}/stripe/connect-client-id"
  "duseum/${ENV}/cloudfront/private-key"
  "duseum/${ENV}/notifications/unsubscribe-secret"
  "duseum/${ENV}/ses/from-address"
)

for SECRET in "${REQUIRED_SECRETS[@]}"; do
  STATUS=$(aws secretsmanager describe-secret \
    --region us-east-1 \
    --secret-id "$SECRET" \
    --query "Name" \
    --output text 2>/dev/null || echo "NOT_FOUND")

  if [[ "$STATUS" == "NOT_FOUND" ]]; then
    fail "${SECRET} — MISSING  → run: bash scripts/bootstrap.sh"
  else
    pass "${SECRET}"
  fi
done

# ── 3. Stripe platform price active ──────────────────────────────────────────
section "STRIPE"

STRIPE_KEY=$(aws secretsmanager get-secret-value \
  --region us-east-1 \
  --secret-id "duseum/${ENV}/stripe/secret-key" \
  --query "SecretString" \
  --output text 2>/dev/null || echo "")

if [[ -z "$STRIPE_KEY" ]]; then
  fail "Cannot verify Stripe price — stripe/secret-key not retrievable from Secrets Manager"
else
  PRICE_ID=$(aws dynamodb get-item \
    --region us-east-1 \
    --table-name "$CONFIG_TABLE" \
    --key '{"PK":{"S":"PLATFORM_SUB_PRICE_ID"}}' \
    --query "Item.value.S" \
    --output text 2>/dev/null || echo "")

  if [[ -z "$PRICE_ID" || "$PRICE_ID" == "None" ]]; then
    fail "Cannot verify Stripe price — PLATFORM_SUB_PRICE_ID not in config table"
  elif [[ "$PRICE_ID" == "REPLACE_WITH_STRIPE_PRICE_ID" ]]; then
    fail "Cannot verify Stripe price — PLATFORM_SUB_PRICE_ID is still a placeholder"
  else
    PRICE_RESP=$(curl -sf "https://api.stripe.com/v1/prices/${PRICE_ID}" \
      -u "${STRIPE_KEY}:" 2>/dev/null || echo "{}")

    ACTIVE=$(echo "$PRICE_RESP" | python3 -c \
      "import json,sys; p=json.load(sys.stdin); print(p.get('active','false'))" \
      2>/dev/null || echo "error")

    if [[ "$ACTIVE" == "True" || "$ACTIVE" == "true" ]]; then
      AMOUNT=$(echo "$PRICE_RESP" | python3 -c \
        "import json,sys; p=json.load(sys.stdin); a=p.get('unit_amount',0); print(f'\${a//100}.{a%100:02d}')" \
        2>/dev/null || echo "unknown")
      INTERVAL=$(echo "$PRICE_RESP" | python3 -c \
        "import json,sys; p=json.load(sys.stdin); print(p.get('recurring',{}).get('interval','?'))" \
        2>/dev/null || echo "unknown")
      pass "${PRICE_ID} — active, ${AMOUNT}/${INTERVAL}"
    else
      fail "${PRICE_ID} — inactive or not found in Stripe (active=${ACTIVE})"
      echo "       → Check Stripe dashboard or re-run bootstrap.sh" >&2
    fi
  fi
fi

# ── Final verdict ──────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════"
if [[ "$FAILURES" -eq 0 ]]; then
  echo "VERDICT: ✅ All dependency checks passed — safe to run smoke tests."
  exit 0
else
  echo "VERDICT: ❌ ${FAILURES} check(s) failed." >&2
  echo "" >&2
  echo "Reference: specs/infrastructure/environment-bootstrap.md" >&2
  echo "Fix:       bash scripts/bootstrap.sh  (idempotent — safe to re-run)" >&2
  exit 1
fi
