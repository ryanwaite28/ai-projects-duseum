#!/usr/bin/env bash
# =============================================================================
# scripts/smoke-test.sh — Post-deploy smoke tests (Section 9.6/9.7)
#
# Usage:
#   bash scripts/smoke-test.sh dev
#   bash scripts/smoke-test.sh prod
#
# Requires: curl, aws CLI (credentials already configured via OIDC in CI)
# Exit code: 0 = all checks passed, 1 = one or more checks failed
# =============================================================================

set -euo pipefail

ENV="${1:-}"
if [[ -z "$ENV" || ( "$ENV" != "dev" && "$ENV" != "prod" ) ]]; then
  echo "Usage: $0 <dev|prod>" >&2
  exit 1
fi

if [[ "$ENV" == "prod" ]]; then
  API_BASE="https://api.duseum.com"
  APP_DOMAIN="duseum.com"
else
  API_BASE="https://api.dev.duseum.com"
  APP_DOMAIN="dev.duseum.com"
fi

REGION="us-east-1"
PASS=0
FAIL=0

# ── Helpers ───────────────────────────────────────────────────────────────────

smoke_ok()   { echo "  ✓ $*"; PASS=$((PASS + 1)); }
smoke_fail() { echo "  ✗ $*" >&2; FAIL=$((FAIL + 1)); }

check_http() {
  local DESC="$1"
  local URL="$2"
  local EXPECT="$3"   # exact code, "2xx", or "non-5xx"

  local STATUS
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    --max-time 15 --retry 3 --retry-delay 2 \
    "$URL" 2>/dev/null || echo "000")

  local PASS_CHECK=false
  if [[ "$EXPECT" == "2xx"     && "$STATUS" =~ ^2 ]]; then PASS_CHECK=true; fi
  if [[ "$EXPECT" == "non-5xx" && ! "$STATUS" =~ ^5 && "$STATUS" != "000" ]]; then PASS_CHECK=true; fi
  if [[ "$EXPECT" == "$STATUS" ]]; then PASS_CHECK=true; fi

  if $PASS_CHECK; then
    smoke_ok "$DESC → HTTP $STATUS"
  else
    smoke_fail "$DESC → expected $EXPECT, got HTTP $STATUS  ($URL)"
  fi
}

# ── API endpoint checks ───────────────────────────────────────────────────────

echo ""
echo "=== API Health Checks ($API_BASE) ==="

# Public endpoints — no auth required
check_http "GET /features/daily"                    "$API_BASE/features/daily"                    "2xx"
check_http "GET /features/weekly"                   "$API_BASE/features/weekly"                   "2xx"
check_http "GET /features/weekly/availability"      "$API_BASE/features/weekly/availability"      "2xx"

# Protected endpoints — no auth, must return 401 not 5xx
check_http "GET /users/me (no auth → 401)"          "$API_BASE/users/me"                          "non-5xx"
check_http "GET /artworks (no auth → 401 or 200)"   "$API_BASE/artworks"                          "non-5xx"

# ── DynamoDB table checks ─────────────────────────────────────────────────────

echo ""
echo "=== DynamoDB Table Checks ==="

for TABLE in \
  "duseum-${ENV}-dynamodb-main" \
  "duseum-${ENV}-dynamodb-idempotency" \
  "duseum-${ENV}-dynamodb-config"; do

  TABLE_STATUS=$(aws dynamodb describe-table \
    --table-name "$TABLE" \
    --region "$REGION" \
    --query "Table.TableStatus" \
    --output text 2>/dev/null || echo "MISSING")

  if [[ "$TABLE_STATUS" == "ACTIVE" ]]; then
    smoke_ok "DynamoDB $TABLE → ACTIVE"
  else
    smoke_fail "DynamoDB $TABLE → $TABLE_STATUS"
  fi
done

# ── CloudFront distribution checks ───────────────────────────────────────────

echo ""
echo "=== CloudFront Distribution Checks ==="

CF_COUNT=$(aws cloudfront list-distributions \
  --region us-east-1 \
  --query "length(DistributionList.Items[?contains(Aliases.Items, '${APP_DOMAIN}') || contains(Aliases.Items, 'media.${APP_DOMAIN}')])" \
  --output text 2>/dev/null || echo "0")

if [[ "$CF_COUNT" -ge 1 ]]; then
  smoke_ok "CloudFront distributions for ${APP_DOMAIN} found ($CF_COUNT)"
else
  smoke_fail "No CloudFront distributions found for ${APP_DOMAIN}"
fi

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "=== Smoke Test Summary ($ENV) ==="
echo "  Passed : $PASS"
echo "  Failed : $FAIL"
echo ""

if [[ "$FAIL" -gt 0 ]]; then
  echo "SMOKE TESTS FAILED — $FAIL check(s) did not pass" >&2
  exit 1
fi

echo "All smoke tests passed."
