#!/usr/bin/env bash
# =============================================================================
# scripts/pre-deploy-check.sh — Bootstrap prerequisites check (read-only)
#
# Verifies that all resources bootstrap.sh creates are present before CDK
# deploy runs. If any are missing, CDK will fail with a confusing IAM/SSM
# error 10–20 minutes into the deploy. This surfaces the real cause in < 15s.
#
# Runs in PARALLEL with the Build job in the deploy pipeline — adds zero
# wall-clock time when passing; saves the full CDK deploy time when failing.
#
# Exit 0 = all prerequisites present
# Exit 1 = one or more missing → operator must run: bash scripts/bootstrap.sh
#
# Usage (CI):    bash scripts/pre-deploy-check.sh <dev|prod>
# Usage (local): bash scripts/pre-deploy-check.sh <dev|prod>
#                (requires aws CLI with rmw-llc profile or OIDC credentials)
#
# What this checks (bootstrap.sh outputs only — NOT CDK-managed resources):
#   1. S3 CI/CD artifact bucket (shared — duseum-cicd-artifacts)
#   2. Secrets Manager secrets for the environment (7 required)
#   3. CloudFront key pair SSM parameter for the environment
#   4. IAM deploy role for the environment
#
# What this deliberately does NOT check (CDK creates these — not pre-existing):
#   • DynamoDB tables (main, idempotency, config)
#   • S3 media bucket, SPA bucket
#   • SQS queues, SNS topics
#   • Lambda functions, API Gateway
#
# Sync rule: when bootstrap.sh gains a new provisioned resource, add a check
# here. See CLAUDE.md — "bootstrap.sh sync rule."
# =============================================================================

set -uo pipefail

ENV="${1:-}"
if [[ -z "$ENV" || ("$ENV" != "dev" && "$ENV" != "prod") ]]; then
  echo "Usage: $0 <dev|prod>" >&2
  exit 1
fi

FAILURES=0

# ── Colour helpers ─────────────────────────────────────────────────────────────
pass() { echo "  ✅ $1"; }
fail() { echo "  ❌ $1" >&2; FAILURES=$((FAILURES + 1)); }
section() { echo ""; echo "$1"; }

echo "══════════════════════════════════════════════════════"
echo "  BOOTSTRAP PREREQUISITES CHECK — ${ENV}"
echo "══════════════════════════════════════════════════════"

# ── 1. S3 CI/CD artifact bucket (shared, not env-specific) ────────────────────
section "S3 ARTIFACT BUCKET"
CICD_BUCKET="duseum-cicd-artifacts"
if aws s3api head-bucket --bucket "$CICD_BUCKET" --region us-east-1 2>/dev/null; then
  pass "${CICD_BUCKET}"
else
  fail "${CICD_BUCKET} — MISSING (run bootstrap.sh to create)"
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
    fail "$SECRET — MISSING"
  else
    pass "$SECRET"
  fi
done

# ── 3. CloudFront key pair SSM parameter ──────────────────────────────────────
section "SSM PARAMETERS"
CF_SSM_PARAM="/duseum/${ENV}/cloudfront/key_pair_id"
CF_VALUE=$(aws ssm get-parameter \
  --region us-east-1 \
  --name "$CF_SSM_PARAM" \
  --query "Parameter.Value" \
  --output text 2>/dev/null || echo "NOT_FOUND")
if [[ "$CF_VALUE" == "NOT_FOUND" || -z "$CF_VALUE" ]]; then
  fail "${CF_SSM_PARAM} — MISSING"
else
  pass "${CF_SSM_PARAM} = ${CF_VALUE}"
fi

# Also verify the Stripe platform price SSM param (set by bootstrap.sh Section 3.7)
PRICE_SSM_PARAM="/duseum/${ENV}/stripe/platform_price_id"
PRICE_SSM_VALUE=$(aws ssm get-parameter \
  --region us-east-1 \
  --name "$PRICE_SSM_PARAM" \
  --query "Parameter.Value" \
  --output text 2>/dev/null || echo "NOT_FOUND")
if [[ "$PRICE_SSM_VALUE" == "NOT_FOUND" || -z "$PRICE_SSM_VALUE" ]]; then
  fail "${PRICE_SSM_PARAM} — MISSING (bootstrap.sh Section 3.7 not run)"
else
  pass "${PRICE_SSM_PARAM} = ${PRICE_SSM_VALUE}"
fi

# ── 4. IAM deploy role ────────────────────────────────────────────────────────
section "IAM ROLES"
ROLE_NAME="duseum-github-actions-deploy-${ENV}"
ROLE_STATUS=$(aws iam get-role \
  --role-name "$ROLE_NAME" \
  --query "Role.RoleName" \
  --output text 2>/dev/null || echo "NOT_FOUND")
if [[ "$ROLE_STATUS" == "NOT_FOUND" ]]; then
  fail "${ROLE_NAME} — MISSING"
else
  pass "${ROLE_NAME}"
fi

# Build role (shared — check once; arbitrarily done in dev pass, harmless in prod)
BUILD_ROLE="duseum-github-actions-build"
BUILD_STATUS=$(aws iam get-role \
  --role-name "$BUILD_ROLE" \
  --query "Role.RoleName" \
  --output text 2>/dev/null || echo "NOT_FOUND")
if [[ "$BUILD_STATUS" == "NOT_FOUND" ]]; then
  fail "${BUILD_ROLE} — MISSING"
else
  pass "${BUILD_ROLE}"
fi

# ── Final verdict ──────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════"
if [[ "$FAILURES" -eq 0 ]]; then
  echo "VERDICT: ✅ All bootstrap prerequisites present — safe to deploy."
  exit 0
else
  echo "VERDICT: ❌ ${FAILURES} prerequisite(s) missing." >&2
  echo "" >&2
  echo "Run bootstrap.sh to provision missing resources:" >&2
  echo "  aws sso login --profile rmw-llc" >&2
  echo "  bash scripts/bootstrap.sh" >&2
  echo "" >&2
  echo "CDK deploy will fail if these are missing. Fix before retrying." >&2
  exit 1
fi
