#!/usr/bin/env bash
# =============================================================================
# scripts/go-live-checklist.sh — Production go-live pre-flight checker
#
# Verifies every item from PROJECT.md Section 11.7 before tagging v1.0.0.
#
# Usage:
#   AWS_PROFILE=rmw-llc bash scripts/go-live-checklist.sh
#
# Optional env vars for side-effect checks (opt-in):
#   SIGNED_URL_TEST_ARTWORK_ID=<artworkId>  — enables check 8 (signed URL e2e)
#   STRIPE_TEST_EVENT_CHECK=true            — enables check 9 (webhook round-trip)
#   STRIPE_DYNAMODB_TABLE=<tableName>       — required when STRIPE_TEST_EVENT_CHECK=true
#
# Requires:
#   - aws CLI v2  (profile rmw-llc with prod credentials)
#   - stripe CLI  (authenticated: stripe login)
#   - curl
#
# Exit code: 0 = all enabled checks passed, 1 = one or more failed
# =============================================================================

set -euo pipefail

AWS_PROFILE="${AWS_PROFILE:-rmw-llc}"
REGION="us-east-1"
ENV="prod"
PASS=0
FAIL=0
SKIP=0

# ── Helpers ───────────────────────────────────────────────────────────────────

ok()   { echo "  ✓  $*"; PASS=$((PASS + 1)); }
fail() { echo "  ✗  $*" >&2; FAIL=$((FAIL + 1)); }
skip() { echo "  ─  $*  [skipped — opt-in env var not set]"; SKIP=$((SKIP + 1)); }
hdr()  { echo ""; echo "── $* ──"; }

aws_cmd() { aws --profile "$AWS_PROFILE" --region "$REGION" "$@"; }

# ── Check 1: SES production access ───────────────────────────────────────────

hdr "1  SES Production Access"

SES_ENABLED=$(aws_cmd ses get-account-sending-enabled \
  --query 'Enabled' --output text 2>/dev/null || echo "ERROR")

if [[ "$SES_ENABLED" == "True" ]]; then
  ok "SES account sending is enabled (production access granted)"
else
  fail "SES sending not enabled → status: $SES_ENABLED"
  fail "  Resolution: AWS Console → SES → Account dashboard → Request production access"
fi

# ── Check 2: Stripe sk_live_ in prod Secrets Manager ─────────────────────────

hdr "2  Stripe Live Key in Secrets Manager"

STRIPE_KEY=$(aws_cmd secretsmanager get-secret-value \
  --secret-id "duseum/prod/stripe/secret-key" \
  --query 'SecretString' --output text 2>/dev/null || echo "MISSING")

if [[ "$STRIPE_KEY" == sk_live_* ]]; then
  ok "duseum/prod/stripe/secret-key → sk_live_*** (live mode)"
elif [[ "$STRIPE_KEY" == sk_test_* ]]; then
  fail "duseum/prod/stripe/secret-key is a TEST key (sk_test_*) — replace with sk_live_* before go-live"
elif [[ "$STRIPE_KEY" == "MISSING" ]]; then
  fail "duseum/prod/stripe/secret-key not found in Secrets Manager"
else
  fail "duseum/prod/stripe/secret-key has unexpected value format"
fi

# Check webhook secret
WEBHOOK_SECRET=$(aws_cmd secretsmanager get-secret-value \
  --secret-id "duseum/prod/stripe/webhook-secret" \
  --query 'SecretString' --output text 2>/dev/null || echo "MISSING")

if [[ "$WEBHOOK_SECRET" == whsec_* ]]; then
  ok "duseum/prod/stripe/webhook-secret → whsec_*** present"
else
  fail "duseum/prod/stripe/webhook-secret missing or invalid (expected whsec_*): $WEBHOOK_SECRET"
fi

# Check CloudFront private key
CF_KEY=$(aws_cmd secretsmanager get-secret-value \
  --secret-id "duseum/prod/cloudfront/private-key" \
  --query 'SecretString' --output text 2>/dev/null || echo "MISSING")

if [[ "$CF_KEY" != "MISSING" && -n "$CF_KEY" ]]; then
  ok "duseum/prod/cloudfront/private-key → present"
else
  fail "duseum/prod/cloudfront/private-key not found in Secrets Manager"
fi

# ── Check 3: Stripe live webhook endpoint → prod API GW ──────────────────────

hdr "3  Stripe Live Webhook Endpoint"

EXPECTED_DEST_ID="we_1TMiH8RUKQLlSd6oP9UMFQ3C"
EXPECTED_URL_PATTERN="api.duseum.com"

if ! command -v stripe &>/dev/null; then
  fail "stripe CLI not found — cannot verify webhook endpoint"
  fail "  Install: brew install stripe/stripe-cli/stripe  then  stripe login"
else
  ENDPOINT_URL=$(stripe webhook_endpoints retrieve "$EXPECTED_DEST_ID" \
    --format json 2>/dev/null \
    | grep '"url"' | head -1 | sed 's/.*"url": "\([^"]*\)".*/\1/' || echo "")

  if [[ "$ENDPOINT_URL" == *"$EXPECTED_URL_PATTERN"* ]]; then
    ok "Stripe webhook $EXPECTED_DEST_ID → $ENDPOINT_URL"
  elif [[ -z "$ENDPOINT_URL" ]]; then
    fail "Could not retrieve Stripe webhook endpoint $EXPECTED_DEST_ID"
    fail "  Verify you are authenticated to the prod Stripe account (acct_1TMYUIRUKQLlSd6o)"
  else
    fail "Webhook endpoint URL does not contain '$EXPECTED_URL_PATTERN': $ENDPOINT_URL"
  fi
fi

# ── Check 4: ACM certificate ISSUED ──────────────────────────────────────────

hdr "4  ACM Certificate Status"

CERT_STATUS=$(aws_cmd acm list-certificates \
  --certificate-statuses ISSUED \
  --query "CertificateSummaryList[?contains(DomainName,'duseum.com')].Status | [0]" \
  --output text 2>/dev/null || echo "NONE")

if [[ "$CERT_STATUS" == "ISSUED" ]]; then
  ok "ACM certificate for duseum.com → ISSUED"
else
  # Try listing all certs to give better diagnostic
  ALL_CERTS=$(aws_cmd acm list-certificates \
    --query "CertificateSummaryList[?contains(DomainName,'duseum.com')].[DomainName,Status]" \
    --output text 2>/dev/null || echo "")
  if [[ -n "$ALL_CERTS" ]]; then
    fail "ACM certificate found but not ISSUED:  $ALL_CERTS"
  else
    fail "No ACM certificate found for duseum.com in us-east-1"
  fi
fi

# ── Check 5: SSM parameters present for prod ─────────────────────────────────

hdr "5  SSM Parameters (prod)"

SSM_COUNT=$(aws_cmd ssm get-parameters-by-path \
  --path "/duseum/prod/stacks/" \
  --recursive \
  --query 'length(Parameters)' \
  --output text 2>/dev/null || echo "0")

SSM_MIN=18

if [[ "$SSM_COUNT" -ge "$SSM_MIN" ]]; then
  ok "SSM /duseum/prod/stacks/ → $SSM_COUNT parameters found (minimum $SSM_MIN)"
else
  fail "SSM /duseum/prod/stacks/ → only $SSM_COUNT parameters found (expected ≥ $SSM_MIN)"
  fail "  Run: aws ssm get-parameters-by-path --path /duseum/prod/stacks/ --recursive"
  fail "       --profile $AWS_PROFILE --query 'Parameters[*].Name'"
fi

# ── Check 6: CDK deploy prod completed ───────────────────────────────────────

hdr "6  CDK Stack Status (prod)"

STACK_ERRORS=0
EXPECTED_STACKS=(
  "duseum-prod-storage"
  "duseum-prod-auth"
  "duseum-prod-messaging"
  "duseum-prod-api"
  "duseum-prod-cdn"
  "duseum-prod-monitoring"
)

for STACK in "${EXPECTED_STACKS[@]}"; do
  STACK_STATUS=$(aws_cmd cloudformation describe-stacks \
    --stack-name "$STACK" \
    --query 'Stacks[0].StackStatus' \
    --output text 2>/dev/null || echo "MISSING")

  if [[ "$STACK_STATUS" == "CREATE_COMPLETE" || "$STACK_STATUS" == "UPDATE_COMPLETE" ]]; then
    ok "$STACK → $STACK_STATUS"
  else
    fail "$STACK → $STACK_STATUS"
    STACK_ERRORS=$((STACK_ERRORS + 1))
  fi
done

if [[ "$STACK_ERRORS" -gt 0 ]]; then
  fail "$STACK_ERRORS stack(s) not in COMPLETE state — run deploy-prod.yml before go-live"
fi

# ── Check 7: Smoke tests passing ─────────────────────────────────────────────

hdr "7  Smoke Tests"

if bash "$(dirname "$0")/smoke-test.sh" prod; then
  ok "smoke-test.sh prod → all checks passed"
else
  fail "smoke-test.sh prod → one or more checks failed (see output above)"
fi

# ── Check 8: CloudFront signed URL e2e (opt-in) ───────────────────────────────

hdr "8  CloudFront Signed URL (Private Piece)"

if [[ -z "${SIGNED_URL_TEST_ARTWORK_ID:-}" ]]; then
  skip "SIGNED_URL_TEST_ARTWORK_ID not set — skipping signed URL end-to-end test"
  skip "  To enable: SIGNED_URL_TEST_ARTWORK_ID=<artworkId> bash scripts/go-live-checklist.sh"
else
  # Fetch the artwork to get its current signed URL from the API
  ARTWORK_JSON=$(curl -sf \
    "https://api.duseum.com/artworks/${SIGNED_URL_TEST_ARTWORK_ID}" \
    -H "Accept: application/json" 2>/dev/null || echo "FETCH_FAILED")

  if [[ "$ARTWORK_JSON" == "FETCH_FAILED" ]]; then
    fail "Could not fetch artwork $SIGNED_URL_TEST_ARTWORK_ID from prod API"
  else
    IMAGE_URL=$(echo "$ARTWORK_JSON" | grep -o '"imageUrl":"[^"]*"' | head -1 | sed 's/"imageUrl":"//;s/"//')
    if [[ -z "$IMAGE_URL" || "$IMAGE_URL" == "null" ]]; then
      fail "Artwork $SIGNED_URL_TEST_ARTWORK_ID has no imageUrl — may be a PUBLIC piece or not yet published"
    else
      CF_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
        --max-time 10 "$IMAGE_URL" 2>/dev/null || echo "000")
      if [[ "$CF_STATUS" == "200" ]]; then
        ok "CloudFront signed URL for artwork $SIGNED_URL_TEST_ARTWORK_ID → HTTP 200"
      else
        fail "CloudFront signed URL → HTTP $CF_STATUS (expected 200)"
        fail "  URL: $IMAGE_URL"
      fi
    fi
  fi
fi

# ── Check 9: Stripe webhook round-trip (opt-in) ───────────────────────────────

hdr "9  Stripe Webhook Test Event"

if [[ "${STRIPE_TEST_EVENT_CHECK:-false}" != "true" ]]; then
  skip "STRIPE_TEST_EVENT_CHECK not set — skipping webhook round-trip test"
  skip "  To enable: STRIPE_TEST_EVENT_CHECK=true STRIPE_DYNAMODB_TABLE=duseum-prod-dynamodb-idempotency bash scripts/go-live-checklist.sh"
elif ! command -v stripe &>/dev/null; then
  fail "stripe CLI not found — cannot trigger test event"
else
  TABLE="${STRIPE_DYNAMODB_TABLE:-duseum-prod-dynamodb-idempotency}"
  echo "  Triggering customer.subscription.created test event…"

  # Capture the event ID from stripe trigger output
  TRIGGER_OUTPUT=$(stripe trigger customer.subscription.created 2>&1 || echo "TRIGGER_FAILED")

  if echo "$TRIGGER_OUTPUT" | grep -q "TRIGGER_FAILED\|Error\|error"; then
    fail "stripe trigger failed: $TRIGGER_OUTPUT"
  else
    EVENT_ID=$(echo "$TRIGGER_OUTPUT" | grep -o 'evt_[A-Za-z0-9]*' | head -1 || echo "")

    if [[ -z "$EVENT_ID" ]]; then
      fail "Could not extract event ID from stripe trigger output"
    else
      echo "  Event ID: $EVENT_ID — polling idempotency table for up to 30s…"
      FOUND=false
      for _ in {1..6}; do
        sleep 5
        ITEM=$(aws_cmd dynamodb get-item \
          --table-name "$TABLE" \
          --key "{\"pk\":{\"S\":\"IDEM#${EVENT_ID}\"},\"sk\":{\"S\":\"IDEM#${EVENT_ID}\"}}" \
          --query 'Item' --output text 2>/dev/null || echo "")
        if [[ -n "$ITEM" && "$ITEM" != "None" ]]; then
          FOUND=true
          break
        fi
      done

      if $FOUND; then
        ok "Stripe webhook event $EVENT_ID processed and recorded in idempotency table"
      else
        fail "Event $EVENT_ID not found in idempotency table after 30s"
        fail "  Check Lambda logs: /aws/lambda/duseum-prod-lambda-subscriptions-webhook"
      fi
    fi
  fi
fi

# ── Check 10: Billing alerts configured ───────────────────────────────────────

hdr "10 Billing Alerts (\$50 / \$200 — account 408141212087)"

# Billing alarms are in us-east-1 (CloudWatch billing metrics only available there)
BILLING_ALARMS=$(aws --profile "$AWS_PROFILE" --region us-east-1 \
  cloudwatch describe-alarms \
  --alarm-types MetricAlarm \
  --query "MetricAlarms[?Namespace=='AWS/Billing'].[AlarmName,Threshold]" \
  --output text 2>/dev/null || echo "")

THRESHOLD_50=false
THRESHOLD_200=false

while IFS=$'\t' read -r ALARM_NAME THRESHOLD; do
  [[ -z "$ALARM_NAME" ]] && continue
  THRESH_INT=$(printf "%.0f" "${THRESHOLD:-0}" 2>/dev/null || echo "0")
  if [[ "$THRESH_INT" -eq 50  ]]; then THRESHOLD_50=true;  ok "Billing alarm at \$50  → $ALARM_NAME"; fi
  if [[ "$THRESH_INT" -eq 200 ]]; then THRESHOLD_200=true; ok "Billing alarm at \$200 → $ALARM_NAME"; fi
done <<< "$BILLING_ALARMS"

if ! $THRESHOLD_50;  then fail "No billing alarm found with threshold \$50  — add via AWS Console → CloudWatch → Billing alarms"; fi
if ! $THRESHOLD_200; then fail "No billing alarm found with threshold \$200 — add via AWS Console → CloudWatch → Billing alarms"; fi

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "══════════════════════════════════════════"
echo "  Go-Live Checklist Summary"
echo "  Passed : $PASS"
echo "  Failed : $FAIL"
echo "  Skipped: $SKIP"
echo "══════════════════════════════════════════"
echo ""

if [[ "$FAIL" -gt 0 ]]; then
  echo "CHECKLIST FAILED — resolve all failures before tagging v1.0.0" >&2
  echo ""
  echo "When all checks pass, tag and release:"
  echo "  git tag -a v1.0.0 -m \"Production go-live — Duseum v1.0.0\""
  echo "  git push origin v1.0.0"
  echo ""
  exit 1
fi

echo "All checks passed."
echo ""
echo "Next steps:"
echo "  1. (Optional) Run load test:  API_BASE=https://api.duseum.com bash scripts/load-test.sh"
echo "  2. Tag and release:"
echo "       git tag -a v1.0.0 -m \"Production go-live — Duseum v1.0.0\""
echo "       git push origin v1.0.0"
echo "  3. Approve the deploy-prod.yml gate in GitHub Actions."
echo ""
