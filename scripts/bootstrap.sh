#!/usr/bin/env bash
# =============================================================================
# scripts/bootstrap.sh — Duseum Phase 0 Provisioning
# =============================================================================
#
# Idempotent: safe to run multiple times.
# Each section checks existing state and skips if already provisioned.
#
# TWO MODES:
#
#   Production AWS (default):
#     Provisions real AWS account resources that CDK cannot create itself.
#       1.   Secrets Manager — all runtime secrets (dev + prod)
#       2.   Secrets Manager — PROD runtime secrets
#       3.   SSM Parameter Store — Stripe publishable keys (non-secret)
#       3.5  CI/CD artifact bucket — duseum-cicd-artifacts (shared)
#       3.6  DynamoDB config table seeding — all required keys (dev + prod)
#       3.7  Stripe platform subscription product + price (dev + prod, idempotent)
#       3.8  DynamoDB FREE collection browse attr backfill (dev + prod, idempotent)
#       4.   CloudFront RSA key pairs + key groups — for signed URLs (dev + prod)
#       5.   GitHub Actions OIDC provider
#       6.   GitHub Actions IAM deploy roles
#
#   Local dev / MiniStack (--local flag):
#     Provisions a complete local-AWS environment in MiniStack that mirrors
#     the CDK stack as closely as possible. Requires MiniStack running at
#     localhost:4566. Builds and deploys all Lambda functions so the full
#     HTTP API is available locally.
#       7.  MiniStack health check
#       8.  DynamoDB tables (main + idempotency + config, all 6 GSIs)
#       9.  S3 buckets (media + spa)
#       10. SQS queues + DLQs (stripe-webhooks + notifications)
#       11. SNS admin-alerts topic
#       12. Cognito User Pool + App Client
#       13. Secrets Manager secrets (local stubs)
#       14. SSM Parameters (mirrors all CDK stack outputs)
#       15. Lambda builds + deployment (all 11 functions via esbuild)
#       16. API Gateway v2 HTTP API + all routes
#       17. EventBridge rules + maintenance-lambda targets
#       18. SES email identity verification
#
# USAGE:
#   Production AWS:
#     1. Copy scripts/.secrets.env.example → scripts/.secrets.env
#     2. Fill in your secret values in scripts/.secrets.env
#     3. aws sso login --profile rmw-llc
#     4. bash scripts/bootstrap.sh
#
#   Local dev (MiniStack must be running — docker-compose up -d):
#     bash scripts/bootstrap.sh --local
#     bash scripts/bootstrap.sh --local --no-lambdas   # skip Lambda build/deploy
#
# REQUIREMENTS: aws-cli v2, openssl, jq, node ≥20, npm (for --local)
#
# LOCAL LIMITATIONS (see Section 16 in PROJECT.md):
#   • Cognito service API (sign-up, sign-in, token issuance) is not listed as
#     supported by MiniStack. User Pool + Client objects are created for IDs,
#     but auth uses ENVIRONMENT=local JWT stub — no real Cognito token needed.
#   • CloudFront CDN: MiniStack stubs the control-plane API only. No real CDN
#     or edge caching. Media is served directly from S3 at localhost:4566.
#   • Route53 DNS: no local DNS resolution — use localhost URLs directly.
#   • WAF: control-plane stubs only — rules are stored but not enforced.
#   • X-Ray: not listed as a supported service in MiniStack.
#   • EventBridge scheduled execution: rules can be created and targeted to
#     Lambda, but cron-based scheduled firing is not documented as supported.
#     Trigger maintenance-lambda manually via aws lambda invoke for testing.
#   • Lambda architecture: ARM64 is not supported locally; all local Lambdas
#     deploy as x86_64.
#
# ⚠ WARNING: scripts/.secrets.env contains live secrets.
#   It is gitignored. NEVER commit it. NEVER share it.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ─── Mode detection ────────────────────────────────────────────────────────────
LOCAL_MODE=false
DEPLOY_LAMBDAS=true
for arg in "$@"; do
  [[ "$arg" == "--local"       ]] && LOCAL_MODE=true
  [[ "$arg" == "--no-lambdas"  ]] && DEPLOY_LAMBDAS=false
done

# ─── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[ OK ]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
step()    { echo -e "\n${BOLD}${BLUE}══════ $* ══════${NC}"; }
banner()  { echo -e "\n${BOLD}$*${NC}"; }

# ═══════════════════════════════════════════════════════════════════════════════
# LOCAL MODE — skip to MiniStack provisioning (Sections 7-18)
# ═══════════════════════════════════════════════════════════════════════════════

if $LOCAL_MODE; then

  MINISTACK_ENDPOINT="http://localhost:4566"
  MS_REGION="us-east-1"
  MS_ACCOUNT="000000000000"
  LOCAL_ENV="local"
  BUILD_DIR="${REPO_ROOT}/.ministack-build"

  # MiniStack CLI wrapper (no SSO needed)
  ms() {
    AWS_ACCESS_KEY_ID=test \
    AWS_SECRET_ACCESS_KEY=test \
    AWS_DEFAULT_REGION="${MS_REGION}" \
    aws --endpoint-url "${MINISTACK_ENDPOINT}" "$@"
  }

  # Idempotent helpers
  ms_table_exists()  { ms dynamodb describe-table --table-name "$1" &>/dev/null; }
  ms_bucket_exists() { ms s3api head-bucket --bucket "$1" &>/dev/null; }
  ms_queue_exists()  { ms sqs get-queue-url --queue-name "$1" &>/dev/null; }
  ms_secret_exists() { ms secretsmanager describe-secret --secret-id "$1" &>/dev/null; }
  ms_ssm_exists()    { ms ssm get-parameter --name "$1" &>/dev/null; }
  ms_lambda_exists() { ms lambda get-function --function-name "$1" &>/dev/null; }
  ms_fn_arn()        { echo "arn:aws:lambda:${MS_REGION}:${MS_ACCOUNT}:function:$1"; }

  ms_upsert_secret() {
    local name="$1" value="$2"
    if ms_secret_exists "$name"; then
      ms secretsmanager put-secret-value --secret-id "$name" --secret-string "$value" --output text >/dev/null
    else
      ms secretsmanager create-secret --name "$name" --secret-string "$value" --output text >/dev/null
    fi
    success "  secret: $name"
  }

  ms_put_ssm() {
    local name="$1" value="$2"
    ms ssm put-parameter --name "$name" --value "$value" --type String --overwrite --output text >/dev/null
    success "  ssm: $name"
  }

  # ═════════════════════════════════════════════════════════════════════════════
  # SECTION 7 — MiniStack health check
  # ═════════════════════════════════════════════════════════════════════════════
  step "MiniStack health check"
  if ! curl -sf "${MINISTACK_ENDPOINT}/_ministack/health" >/dev/null 2>&1; then
    echo -e "${RED}ERROR: MiniStack is not running at ${MINISTACK_ENDPOINT}${NC}" >&2
    echo "  Start it with:  docker-compose up -d" >&2
    echo "  or:             pip install ministack && ministack" >&2
    exit 1
  fi
  success "MiniStack is healthy at ${MINISTACK_ENDPOINT}"

  # ═════════════════════════════════════════════════════════════════════════════
  # SECTION 8 — DynamoDB tables
  # All GSIs match infrastructure/stacks/storage-stack.ts exactly.
  # ═════════════════════════════════════════════════════════════════════════════
  step "DynamoDB tables"

  MAIN_TABLE="duseum-${LOCAL_ENV}-dynamodb-main"
  IDMP_TABLE="duseum-${LOCAL_ENV}-dynamodb-idempotency"
  CONF_TABLE="duseum-${LOCAL_ENV}-dynamodb-config"

  if ms_table_exists "$MAIN_TABLE"; then
    success "  $MAIN_TABLE (exists — skipping)"
  else
    info "  Creating $MAIN_TABLE with 6 GSIs..."
    ms dynamodb create-table \
      --table-name "$MAIN_TABLE" \
      --attribute-definitions \
        'AttributeName=PK,AttributeType=S' \
        'AttributeName=SK,AttributeType=S' \
        'AttributeName=authorId,AttributeType=S' \
        'AttributeName=visibility#createdAt,AttributeType=S' \
        'AttributeName=status,AttributeType=S' \
        'AttributeName=createdAt,AttributeType=S' \
        'AttributeName=followedAt,AttributeType=S' \
        'AttributeName=subscribedAt,AttributeType=S' \
        'AttributeName=tag,AttributeType=S' \
        'AttributeName=featureStatus,AttributeType=S' \
        'AttributeName=isoWeek,AttributeType=S' \
      --key-schema \
        'AttributeName=PK,KeyType=HASH' \
        'AttributeName=SK,KeyType=RANGE' \
      --billing-mode PAY_PER_REQUEST \
      --global-secondary-indexes '[
        {
          "IndexName": "GSI-AuthorPublic",
          "KeySchema": [
            {"AttributeName": "authorId",             "KeyType": "HASH"},
            {"AttributeName": "visibility#createdAt", "KeyType": "RANGE"}
          ],
          "Projection": {"ProjectionType": "ALL"}
        },
        {
          "IndexName": "GSI-AllPublicPieces",
          "KeySchema": [
            {"AttributeName": "status",    "KeyType": "HASH"},
            {"AttributeName": "createdAt", "KeyType": "RANGE"}
          ],
          "Projection": {"ProjectionType": "ALL"}
        },
        {
          "IndexName": "GSI-FollowersByAuthor",
          "KeySchema": [
            {"AttributeName": "authorId",  "KeyType": "HASH"},
            {"AttributeName": "followedAt","KeyType": "RANGE"}
          ],
          "Projection": {"ProjectionType": "ALL"}
        },
        {
          "IndexName": "GSI-SubscribersByAuthor",
          "KeySchema": [
            {"AttributeName": "authorId",     "KeyType": "HASH"},
            {"AttributeName": "subscribedAt", "KeyType": "RANGE"}
          ],
          "Projection": {"ProjectionType": "ALL"}
        },
        {
          "IndexName": "GSI-TagIndex",
          "KeySchema": [
            {"AttributeName": "tag",       "KeyType": "HASH"},
            {"AttributeName": "createdAt", "KeyType": "RANGE"}
          ],
          "Projection": {"ProjectionType": "ALL"}
        },
        {
          "IndexName": "GSI-WeeklyFeatureByStatus",
          "KeySchema": [
            {"AttributeName": "featureStatus", "KeyType": "HASH"},
            {"AttributeName": "isoWeek",       "KeyType": "RANGE"}
          ],
          "Projection": {"ProjectionType": "ALL"}
        }
      ]' --output text >/dev/null
    success "  $MAIN_TABLE created"
  fi

  if ms_table_exists "$IDMP_TABLE"; then
    success "  $IDMP_TABLE (exists — skipping)"
  else
    ms dynamodb create-table \
      --table-name "$IDMP_TABLE" \
      --attribute-definitions 'AttributeName=PK,AttributeType=S' \
      --key-schema 'AttributeName=PK,KeyType=HASH' \
      --billing-mode PAY_PER_REQUEST --output text >/dev/null
    ms dynamodb update-time-to-live \
      --table-name "$IDMP_TABLE" \
      --time-to-live-specification 'Enabled=true,AttributeName=ttl' --output text >/dev/null
    success "  $IDMP_TABLE created (TTL on 'ttl')"
  fi

  if ms_table_exists "$CONF_TABLE"; then
    success "  $CONF_TABLE (exists — skipping)"
  else
    ms dynamodb create-table \
      --table-name "$CONF_TABLE" \
      --attribute-definitions 'AttributeName=PK,AttributeType=S' \
      --key-schema 'AttributeName=PK,KeyType=HASH' \
      --billing-mode PAY_PER_REQUEST --output text >/dev/null
    success "  $CONF_TABLE created"
  fi

  # Seed config values (idempotent — overwrite safe)
  info "  Seeding config table..."
  ms dynamodb put-item --table-name "$CONF_TABLE" --item '{"PK":{"S":"FREE_TIER_LIMIT"},       "value":{"N":"10"}}' --output text >/dev/null
  ms dynamodb put-item --table-name "$CONF_TABLE" --item '{"PK":{"S":"PLATFORM_CUT_PERCENT"},  "value":{"N":"20"}}' --output text >/dev/null
  ms dynamodb put-item --table-name "$CONF_TABLE" --item '{"PK":{"S":"PLATFORM_SUB_PRICE_ID"}, "value":{"S":"price_test_local"}}' --output text >/dev/null
  ms dynamodb put-item --table-name "$CONF_TABLE" --item '{"PK":{"S":"FEATURED_AUTHORS"},       "authorIds":{"L":[]}}' --output text >/dev/null
  ms dynamodb put-item --table-name "$CONF_TABLE" --item '{"PK":{"S":"DAILY_FEATURED_AUTHOR"},  "authorId":{"S":""},"selectedAt":{"S":""}}' --output text >/dev/null
  ms dynamodb put-item --table-name "$CONF_TABLE" --item '{"PK":{"S":"DAILY_FEATURED_EXCLUSIONS"},"authorIds":{"L":[]}}' --output text >/dev/null
  ms dynamodb put-item --table-name "$CONF_TABLE" --item '{"PK":{"S":"WEEKLY_FEATURE_FEE_USD"}, "value":{"N":"25"}}' --output text >/dev/null
  ms dynamodb put-item --table-name "$CONF_TABLE" --item '{"PK":{"S":"WEEKLY_FEATURE_SLOT_COUNT"},"value":{"N":"10"}}' --output text >/dev/null
  ms dynamodb put-item --table-name "$CONF_TABLE" --item '{"PK":{"S":"WEEKLY_FEATURE_ADVANCE_WEEKS"},"value":{"N":"8"}}' --output text >/dev/null
  ms dynamodb put-item --table-name "$CONF_TABLE" --item '{"PK":{"S":"ACTIVE_PLATFORM_SUB_COUNT"},"value":{"N":"0"}}' --output text >/dev/null
  ms dynamodb put-item --table-name "$CONF_TABLE" --item '{"PK":{"S":"ACTIVE_AUTHOR_SUB_COUNT"}, "value":{"N":"0"}}' --output text >/dev/null
  ms dynamodb put-item --table-name "$CONF_TABLE" --item '{"PK":{"S":"PLATFORM_MRR_USD_CENTS"}, "value":{"N":"0"}}' --output text >/dev/null
  success "  Config table seeded"

  # ═════════════════════════════════════════════════════════════════════════════
  # SECTION 9 — S3 buckets
  # Matches infrastructure/stacks/storage-stack.ts bucket names.
  # ═════════════════════════════════════════════════════════════════════════════
  step "S3 buckets"

  MEDIA_BUCKET="duseum-${LOCAL_ENV}-s3-media"
  SPA_BUCKET="duseum-${LOCAL_ENV}-s3-spa"

  for bucket in "$MEDIA_BUCKET" "$SPA_BUCKET"; do
    if ms_bucket_exists "$bucket"; then
      success "  s3://$bucket (exists — skipping)"
    else
      ms s3 mb "s3://${bucket}" --output text >/dev/null
      success "  s3://$bucket created"
    fi
  done

  # CORS on media bucket (mirrors CDK: allow PUT from any origin)
  ms s3api put-bucket-cors --bucket "$MEDIA_BUCKET" \
    --cors-configuration '{
      "CORSRules": [{
        "AllowedMethods": ["PUT","GET","HEAD"],
        "AllowedOrigins": ["*"],
        "AllowedHeaders": ["*"],
        "MaxAgeSeconds": 3000
      }]
    }' 2>/dev/null || true

  # ═════════════════════════════════════════════════════════════════════════════
  # SECTION 10 — SQS queues + DLQs
  # Matches infrastructure/stacks/messaging-stack.ts queue names.
  # ═════════════════════════════════════════════════════════════════════════════
  step "SQS queues"

  STRIPE_DLQ="duseum-${LOCAL_ENV}-sqs-stripe-webhooks-dlq"
  STRIPE_Q="duseum-${LOCAL_ENV}-sqs-stripe-webhooks"
  NOTIF_DLQ="duseum-${LOCAL_ENV}-sqs-notifications-dlq"
  NOTIF_Q="duseum-${LOCAL_ENV}-sqs-notifications"

  for dlq in "$STRIPE_DLQ" "$NOTIF_DLQ"; do
    if ms_queue_exists "$dlq"; then
      success "  $dlq (exists — skipping)"
    else
      ms sqs create-queue --queue-name "$dlq" --output text >/dev/null
      success "  $dlq created"
    fi
  done

  STRIPE_DLQ_ARN="arn:aws:sqs:${MS_REGION}:${MS_ACCOUNT}:${STRIPE_DLQ}"
  NOTIF_DLQ_ARN="arn:aws:sqs:${MS_REGION}:${MS_ACCOUNT}:${NOTIF_DLQ}"

  if ms_queue_exists "$STRIPE_Q"; then
    success "  $STRIPE_Q (exists — skipping)"
  else
    ms sqs create-queue --queue-name "$STRIPE_Q" \
      --attributes "{
        \"VisibilityTimeout\":\"60\",
        \"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"${STRIPE_DLQ_ARN}\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"
      }" --output text >/dev/null
    success "  $STRIPE_Q created (vis=60s, maxReceive=3)"
  fi

  if ms_queue_exists "$NOTIF_Q"; then
    success "  $NOTIF_Q (exists — skipping)"
  else
    ms sqs create-queue --queue-name "$NOTIF_Q" \
      --attributes "{
        \"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"${NOTIF_DLQ_ARN}\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"
      }" --output text >/dev/null
    success "  $NOTIF_Q created (maxReceive=3)"
  fi

  STRIPE_Q_URL="${MINISTACK_ENDPOINT}/${MS_ACCOUNT}/${STRIPE_Q}"
  NOTIF_Q_URL="${MINISTACK_ENDPOINT}/${MS_ACCOUNT}/${NOTIF_Q}"
  STRIPE_DLQ_URL="${MINISTACK_ENDPOINT}/${MS_ACCOUNT}/${STRIPE_DLQ}"
  NOTIF_DLQ_URL="${MINISTACK_ENDPOINT}/${MS_ACCOUNT}/${NOTIF_DLQ}"
  STRIPE_Q_ARN="arn:aws:sqs:${MS_REGION}:${MS_ACCOUNT}:${STRIPE_Q}"
  NOTIF_Q_ARN="arn:aws:sqs:${MS_REGION}:${MS_ACCOUNT}:${NOTIF_Q}"

  # ═════════════════════════════════════════════════════════════════════════════
  # SECTION 11 — SNS admin-alerts topic
  # Matches infrastructure/stacks/messaging-stack.ts.
  # ═════════════════════════════════════════════════════════════════════════════
  step "SNS topics"

  SNS_TOPIC="duseum-${LOCAL_ENV}-sns-admin-alerts"
  SNS_TOPIC_ARN=$(ms sns create-topic --name "$SNS_TOPIC" --query 'TopicArn' --output text 2>/dev/null \
    || echo "arn:aws:sns:${MS_REGION}:${MS_ACCOUNT}:${SNS_TOPIC}")
  success "  $SNS_TOPIC — $SNS_TOPIC_ARN"

  # ═════════════════════════════════════════════════════════════════════════════
  # SECTION 12 — Cognito User Pool + App Client
  #
  # NOTE: The Cognito Identity Provider service API (sign-up, InitiateAuth,
  # token issuance) is not listed in MiniStack's supported services table.
  # We attempt User Pool + Client creation to get real IDs for Lambda env vars
  # and SSM params. Auth in the local stack uses ENVIRONMENT=local JWT stub —
  # the middleware decodes the token payload without signature verification.
  # ═════════════════════════════════════════════════════════════════════════════
  step "Cognito User Pool + App Client"

  UP_NAME="duseum-${LOCAL_ENV}-cognito-userpool"
  UC_NAME="duseum-${LOCAL_ENV}-cognito-client"

  # Try direct API first (MiniStack may support CreateUserPool via CloudFormation
  # resource handler even if it's not explicitly listed as a service endpoint).
  USER_POOL_ID=$(ms cognito-idp create-user-pool \
    --pool-name "$UP_NAME" \
    --policies 'PasswordPolicy={MinimumLength=8,RequireUppercase=true,RequireLowercase=true,RequireNumbers=true,RequireSymbols=true}' \
    --auto-verified-attributes email \
    --username-attributes email \
    --query 'UserPool.Id' --output text 2>/dev/null || echo "local_stub_userpool")

  if [[ "$USER_POOL_ID" == "local_stub_userpool" ]]; then
    warn "  cognito-idp CreateUserPool not available in this MiniStack build — using stub IDs"
    warn "  (Real Cognito auth flows are not needed: ENVIRONMENT=local JWT stub handles auth)"
    USER_POOL_ID="us-east-1_localstub"
    USER_POOL_CLIENT_ID="local-stub-client-id"
    USER_POOL_ARN="arn:aws:cognito-idp:${MS_REGION}:${MS_ACCOUNT}:userpool/${USER_POOL_ID}"
  else
    success "  User Pool: ${USER_POOL_ID}"
    USER_POOL_ARN="arn:aws:cognito-idp:${MS_REGION}:${MS_ACCOUNT}:userpool/${USER_POOL_ID}"
    USER_POOL_CLIENT_ID=$(ms cognito-idp create-user-pool-client \
      --user-pool-id "$USER_POOL_ID" \
      --client-name "$UC_NAME" \
      --no-generate-secret \
      --explicit-auth-flows ALLOW_USER_SRP_AUTH ALLOW_REFRESH_TOKEN_AUTH \
      --query 'UserPoolClient.ClientId' --output text 2>/dev/null || echo "local-stub-client-id")
    success "  App Client: ${USER_POOL_CLIENT_ID}"
  fi

  # ═════════════════════════════════════════════════════════════════════════════
  # SECTION 13 — Secrets Manager
  # Mirrors production secret names under duseum/local/…
  # CloudFront private key is generated fresh so generateSignedUrl() works.
  # ═════════════════════════════════════════════════════════════════════════════
  step "Secrets Manager"

  ms_upsert_secret "duseum/local/stripe/secret-key"             "sk_test_REPLACE_WITH_YOUR_TEST_KEY"
  ms_upsert_secret "duseum/local/stripe/webhook-secret"         "whsec_REPLACE_WITH_YOUR_WEBHOOK_SECRET"
  ms_upsert_secret "duseum/local/stripe/webhook-secret-account" "whsec_REPLACE_WITH_YOUR_ACCOUNT_WEBHOOK_SECRET"
  ms_upsert_secret "duseum/local/stripe/connect-client-id"      "ca_REPLACE_WITH_YOUR_CONNECT_CLIENT_ID"
  ms_upsert_secret "duseum/local/ses/from-address"              "no-reply@duseum.com"
  ms_upsert_secret "duseum/local/notifications/unsubscribe-secret" "local-dev-unsubscribe-hmac-secret-32chars"

  # Generate a real RSA-2048 private key — required by @aws-sdk/cloudfront-signer
  # to produce signed URLs for PRIVATE artworks.
  CF_KEY_FILE=$(mktemp /tmp/duseum-local-cf-XXXXXX.pem)
  openssl genrsa -out "$CF_KEY_FILE" 2048 2>/dev/null
  CF_PRIVATE_KEY=$(cat "$CF_KEY_FILE")
  rm -f "$CF_KEY_FILE"
  ms_upsert_secret "duseum/local/cloudfront/private-key" "$CF_PRIVATE_KEY"

  # ═════════════════════════════════════════════════════════════════════════════
  # SECTION 14 — SSM Parameters (mirrors all CDK stack outputs)
  # /duseum/local/stacks/{stack}/{key} — matches Section 5.4 naming.
  # ═════════════════════════════════════════════════════════════════════════════
  step "SSM Parameters"

  MEDIA_BUCKET_ARN="arn:aws:s3:::${MEDIA_BUCKET}"
  CF_KEY_PAIR_ID="local-stub-cf-key-pair-id"
  CF_MEDIA_DOMAIN="localhost:4566/${MEDIA_BUCKET}"

  # Storage stack outputs
  ms_put_ssm "/duseum/local/stacks/storage/dynamodb_main_table_name"        "$MAIN_TABLE"
  ms_put_ssm "/duseum/local/stacks/storage/dynamodb_idempotency_table_name" "$IDMP_TABLE"
  ms_put_ssm "/duseum/local/stacks/storage/dynamodb_config_table_name"      "$CONF_TABLE"
  ms_put_ssm "/duseum/local/stacks/storage/media_bucket_name"               "$MEDIA_BUCKET"
  ms_put_ssm "/duseum/local/stacks/storage/media_bucket_arn"                "$MEDIA_BUCKET_ARN"
  ms_put_ssm "/duseum/local/stacks/storage/spa_bucket_name"                 "$SPA_BUCKET"

  # Auth stack outputs
  ms_put_ssm "/duseum/local/stacks/auth/user_pool_id"        "$USER_POOL_ID"
  ms_put_ssm "/duseum/local/stacks/auth/user_pool_client_id" "$USER_POOL_CLIENT_ID"
  ms_put_ssm "/duseum/local/stacks/auth/user_pool_arn"        "$USER_POOL_ARN"
  ms_put_ssm "/duseum/local/stacks/auth/post_confirm_lambda_arn" \
    "$(ms_fn_arn "duseum-local-lambda-auth-triggers")"

  # Messaging stack outputs
  ms_put_ssm "/duseum/local/stacks/messaging/stripe_webhook_queue_url"  "$STRIPE_Q_URL"
  ms_put_ssm "/duseum/local/stacks/messaging/stripe_webhook_queue_arn"  "$STRIPE_Q_ARN"
  ms_put_ssm "/duseum/local/stacks/messaging/stripe_webhook_dlq_url"    "$STRIPE_DLQ_URL"
  ms_put_ssm "/duseum/local/stacks/messaging/notification_queue_url"    "$NOTIF_Q_URL"
  ms_put_ssm "/duseum/local/stacks/messaging/notification_queue_arn"    "$NOTIF_Q_ARN"
  ms_put_ssm "/duseum/local/stacks/messaging/notification_dlq_url"      "$NOTIF_DLQ_URL"
  ms_put_ssm "/duseum/local/stacks/messaging/sns_admin_alerts_arn"      "$SNS_TOPIC_ARN"

  # CDN stack outputs
  # NOTE: CloudFront CDN is not available locally — media is served directly
  # from S3. The domain is set to the local S3 endpoint for local dev.
  ms_put_ssm "/duseum/local/stacks/cdn/media_distribution_domain" "$CF_MEDIA_DOMAIN"
  ms_put_ssm "/duseum/local/stacks/cdn/cloudfront_key_pair_id"    "$CF_KEY_PAIR_ID"
  ms_put_ssm "/duseum/local/stacks/cdn/app_distribution_domain"   "localhost:5173"
  ms_put_ssm "/duseum/local/cloudfront/key_pair_id"               "$CF_KEY_PAIR_ID"

  # Stripe publishable key (non-secret)
  ms_put_ssm "/duseum/local/stripe/publishable_key" "pk_test_REPLACE_WITH_YOUR_TEST_KEY"

  # ═════════════════════════════════════════════════════════════════════════════
  # SECTION 15 — Lambda builds + deployment
  # Builds each Lambda with esbuild (single CJS bundle) and deploys to MiniStack.
  # Use --no-lambdas to skip this section.
  # ═════════════════════════════════════════════════════════════════════════════
  step "Lambda builds + deployment"

  if ! $DEPLOY_LAMBDAS; then
    warn "  Skipping Lambda deployment (--no-lambdas)"
  else
    # Check esbuild is available (installed as devDependency)
    ESBUILD="${REPO_ROOT}/node_modules/.bin/esbuild"
    if [[ ! -x "$ESBUILD" ]]; then
      warn "  esbuild not found at ${ESBUILD}"
      info "  Running npm install in repo root..."
      (cd "${REPO_ROOT}" && npm install --silent)
    fi

    mkdir -p "$BUILD_DIR"

    # Common env vars injected into every Lambda (mirrors ApiStack commonEnv)
    COMMON_ENV_JSON=$(jq -n \
      --arg env      "local" \
      --arg ep       "${MINISTACK_ENDPOINT}" \
      --arg table    "$MAIN_TABLE" \
      --arg idmp     "$IDMP_TABLE" \
      --arg cfg      "$CONF_TABLE" \
      --arg bucket   "$MEDIA_BUCKET" \
      --arg cfdomain "$CF_MEDIA_DOMAIN" \
      --arg cfkeyid  "$CF_KEY_PAIR_ID" \
      --arg poolid   "$USER_POOL_ID" \
      --arg clientid "$USER_POOL_CLIENT_ID" \
      '{
        ENVIRONMENT:              $env,
        AWS_ENDPOINT_URL:         $ep,
        AWS_REGION:               "us-east-1",
        AWS_ACCESS_KEY_ID:        "test",
        AWS_SECRET_ACCESS_KEY:    "test",
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: "1",
        NODE_OPTIONS:             "--enable-source-maps",
        DYNAMODB_TABLE_NAME:      $table,
        IDEMPOTENCY_TABLE_NAME:   $idmp,
        CONFIG_TABLE_NAME:        $cfg,
        S3_MEDIA_BUCKET_NAME:     $bucket,
        CLOUDFRONT_MEDIA_DOMAIN:  $cfdomain,
        CLOUDFRONT_KEY_PAIR_ID:   $cfkeyid,
        COGNITO_USER_POOL_ID:     $poolid,
        COGNITO_CLIENT_ID:        $clientid
      }')

    # Build helper: bundle entry.ts → .ministack-build/{name}/index.js → zip
    build_lambda() {
      local name="$1" entry="$2"
      local out_dir="${BUILD_DIR}/${name}"
      mkdir -p "$out_dir"
      info "    Building ${name}..."
      "${ESBUILD}" "${REPO_ROOT}/${entry}" \
        --bundle \
        --platform=node \
        --target=node20 \
        --format=cjs \
        --outfile="${out_dir}/index.js" \
        --minify \
        2>/dev/null
      (cd "$out_dir" && zip -q9 "${name}.zip" index.js)
      echo "${out_dir}/${name}.zip"
    }

    # Deploy helper: create or update Lambda in MiniStack
    deploy_lambda() {
      local fn_name="$1" zip_path="$2" extra_env_json="$3"
      local full_fn="duseum-local-lambda-${fn_name}"
      # Merge common + extra env
      local merged_env
      merged_env=$(echo "$COMMON_ENV_JSON" | \
        jq --argjson extra "$extra_env_json" '. + $extra')
      local vars_str
      vars_str=$(echo "$merged_env" | \
        jq -r 'to_entries | map("\(.key)=\(.value)") | join(",")')

      if ms_lambda_exists "$full_fn"; then
        ms lambda update-function-code \
          --function-name "$full_fn" \
          --zip-file "fileb://${zip_path}" \
          --output text >/dev/null
        ms lambda update-function-configuration \
          --function-name "$full_fn" \
          --environment "Variables={${vars_str}}" \
          --output text >/dev/null
      else
        ms lambda create-function \
          --function-name "$full_fn" \
          --runtime nodejs20.x \
          --architectures x86_64 \
          --handler index.handler \
          --role "arn:aws:iam::${MS_ACCOUNT}:role/lambda-local-role" \
          --zip-file "fileb://${zip_path}" \
          --timeout 29 \
          --memory-size 256 \
          --environment "Variables={${vars_str}}" \
          --output text >/dev/null
      fi
      success "    duseum-local-lambda-${fn_name}"
    }

    info "  Building and deploying 12 Lambda functions..."

    # Each tuple: fn-name  entry-path  extra-env-json
    build_deploy() {
      local name="$1" entry="$2" extra="${3:-{}}"
      local zip_path
      zip_path=$(build_lambda "$name" "$entry")
      deploy_lambda "$name" "$zip_path" "$extra"
    }

    build_deploy "media"    "lambdas/media/src/index.ts"
    build_deploy "artworks" "lambdas/artworks/src/index.ts" \
      "$(jq -n --arg q "$NOTIF_Q_URL" '{NOTIFICATION_QUEUE_URL: $q}')"
    build_deploy "users"    "lambdas/users/src/index.ts"
    build_deploy "subscriptions" "lambdas/subscriptions/src/index.ts"
    build_deploy "stripe-ingress" "lambdas/subscriptions-webhook/src/ingress.ts" \
      "$(jq -n --arg q "$STRIPE_Q_URL" '{STRIPE_WEBHOOK_QUEUE_URL: $q}')"
    build_deploy "subscriptions-webhook" "lambdas/subscriptions-webhook/src/index.ts"
    build_deploy "notifications" "lambdas/notifications/src/index.ts"
    build_deploy "features"  "lambdas/features/src/index.ts"
    build_deploy "social"    "lambdas/social/src/index.ts"
    build_deploy "admin"     "lambdas/admin/src/index.ts" \
      "$(jq -n \
        --arg sdlq "$STRIPE_DLQ_URL" \
        --arg ndlq "$NOTIF_DLQ_URL" \
        --arg dr   "duseum-local-eventbridge-daily-featured-author" \
        --arg wr   "duseum-local-eventbridge-weekly-feature-rotation" \
        '{
          STRIPE_WEBHOOK_DLQ_URL:    $sdlq,
          NOTIFICATION_DLQ_URL:      $ndlq,
          DAILY_FEATURE_RULE_NAME:   $dr,
          WEEKLY_ROTATION_RULE_NAME: $wr
        }')"
    build_deploy "maintenance" "lambdas/maintenance/src/index.ts" \
      "$(jq -n \
        --arg dr "duseum-local-eventbridge-daily-featured-author" \
        --arg wr "duseum-local-eventbridge-weekly-feature-rotation" \
        '{
          DAILY_FEATURE_RULE_NAME:   $dr,
          WEEKLY_ROTATION_RULE_NAME: $wr
        }')"
    build_deploy "auth-triggers" "lambdas/auth-triggers/src/handler.ts"

    success "  All Lambdas deployed"
    rm -rf "$BUILD_DIR"
  fi  # end DEPLOY_LAMBDAS

  # ═════════════════════════════════════════════════════════════════════════════
  # SECTION 16 — API Gateway v2 HTTP API + routes
  # Mirrors all routes from infrastructure/stacks/api-stack.ts.
  # Authorisation is NONE on all routes — ENVIRONMENT=local JWT stub handles
  # auth inside the Lambda middleware (no API GW JWT verification needed).
  # ═════════════════════════════════════════════════════════════════════════════
  step "API Gateway v2 HTTP API"

  API_NAME="duseum-${LOCAL_ENV}-apigw"

  # Check if we already have an API with this name
  EXISTING_API_ID=$(ms apigatewayv2 get-apis \
    --query "Items[?Name=='${API_NAME}'].ApiId | [0]" \
    --output text 2>/dev/null || echo "")

  if [[ -n "$EXISTING_API_ID" && "$EXISTING_API_ID" != "None" ]]; then
    API_ID="$EXISTING_API_ID"
    success "  HTTP API exists: ${API_ID} — skipping create"
  else
    API_ID=$(ms apigatewayv2 create-api \
      --name "$API_NAME" \
      --protocol-type HTTP \
      --cors-configuration '{
        "AllowOrigins": ["*"],
        "AllowHeaders": ["Authorization","Content-Type","Stripe-Signature"],
        "AllowMethods": ["GET","POST","PUT","PATCH","DELETE","OPTIONS"]
      }' \
      --query 'ApiId' --output text)
    # Create $default stage with auto-deploy
    ms apigatewayv2 create-stage \
      --api-id "$API_ID" \
      --stage-name '$default' \
      --auto-deploy \
      --output text >/dev/null
    success "  HTTP API created: ${API_ID}"
  fi

  API_URL="${MINISTACK_ENDPOINT}/_aws/execute-api/${API_ID}/\$default"
  ms_put_ssm "/duseum/local/stacks/api/api_gateway_id"  "$API_ID"
  ms_put_ssm "/duseum/local/stacks/api/api_gateway_url" "$API_URL"

  if $DEPLOY_LAMBDAS; then
    info "  Creating integrations and routes..."

    # Helper: create a Lambda integration and return its ID
    make_integration() {
      local fn_id="$1"
      local fn_arn
      fn_arn=$(ms_fn_arn "duseum-local-lambda-${fn_id}")
      ms apigatewayv2 create-integration \
        --api-id "$API_ID" \
        --integration-type AWS_PROXY \
        --integration-uri "$fn_arn" \
        --payload-format-version "2.0" \
        --query 'IntegrationId' --output text
    }

    # Helper: add a route pointing to an integration
    add_route() {
      local route_key="$1" int_id="$2"
      ms apigatewayv2 create-route \
        --api-id "$API_ID" \
        --route-key "$route_key" \
        --target "integrations/${int_id}" \
        --output text >/dev/null
    }

    # Delete existing routes/integrations so re-runs don't duplicate
    EXISTING_ROUTES=$(ms apigatewayv2 get-routes --api-id "$API_ID" \
      --query 'Items[].RouteId' --output text 2>/dev/null || echo "")
    for rid in $EXISTING_ROUTES; do
      ms apigatewayv2 delete-route --api-id "$API_ID" --route-id "$rid" --output text >/dev/null 2>/dev/null || true
    done
    EXISTING_INTS=$(ms apigatewayv2 get-integrations --api-id "$API_ID" \
      --query 'Items[].IntegrationId' --output text 2>/dev/null || echo "")
    for iid in $EXISTING_INTS; do
      ms apigatewayv2 delete-integration --api-id "$API_ID" --integration-id "$iid" --output text >/dev/null 2>/dev/null || true
    done

    # ── media-lambda ──────────────────────────────────────────────────────────
    MEDIA_INT=$(make_integration "media")
    add_route "POST /media/upload-intent"  "$MEDIA_INT"

    # ── artworks-lambda ───────────────────────────────────────────────────────
    ART_INT=$(make_integration "artworks")
    add_route "GET /artworks"                                           "$ART_INT"
    add_route "GET /artworks/{artworkId}"                              "$ART_INT"
    add_route "POST /artworks"                                          "$ART_INT"
    add_route "PUT /artworks/{artworkId}"                              "$ART_INT"
    add_route "DELETE /artworks/{artworkId}"                           "$ART_INT"
    add_route "POST /collections"                                       "$ART_INT"
    add_route "GET /collections/{collectionId}"                        "$ART_INT"
    add_route "PUT /collections/{collectionId}"                        "$ART_INT"
    add_route "DELETE /collections/{collectionId}"                     "$ART_INT"
    add_route "GET /collections/{collectionId}/pieces"                 "$ART_INT"
    add_route "POST /collections/{collectionId}/pieces"                "$ART_INT"
    add_route "DELETE /collections/{collectionId}/pieces/{artworkId}"  "$ART_INT"

    # ── users-lambda ──────────────────────────────────────────────────────────
    USR_INT=$(make_integration "users")
    add_route "GET /users/me"                               "$USR_INT"
    add_route "PUT /users/me/viewer"                        "$USR_INT"
    add_route "POST /users/me/author"                       "$USR_INT"
    add_route "PUT /users/me/author"                        "$USR_INT"
    add_route "GET /users/{userId}/profile"                 "$USR_INT"
    add_route "GET /authors"                                "$USR_INT"
    add_route "GET /authors/{authorId}"                     "$USR_INT"
    add_route "GET /authors/{authorId}/collections"         "$USR_INT"
    add_route "GET /authors/{authorId}/artworks"            "$USR_INT"

    # ── subscriptions-lambda ──────────────────────────────────────────────────
    SUB_INT=$(make_integration "subscriptions")
    add_route "GET /subscriptions/me"                              "$SUB_INT"
    add_route "POST /subscriptions/platform"                       "$SUB_INT"
    add_route "POST /subscriptions/authors/{authorId}"             "$SUB_INT"
    add_route "POST /subscriptions/portal"                         "$SUB_INT"
    add_route "POST /subscriptions/connect/onboard"                "$SUB_INT"
    add_route "GET /subscriptions/connect/status"                  "$SUB_INT"
    add_route "POST /users/me/author/subscription-price"           "$SUB_INT"

    # ── stripe-ingress-lambda ─────────────────────────────────────────────────
    ING_INT=$(make_integration "stripe-ingress")
    add_route "POST /webhooks/stripe"  "$ING_INT"

    # ── features-lambda ───────────────────────────────────────────────────────
    FT_INT=$(make_integration "features")
    add_route "GET /features/daily"                "$FT_INT"
    add_route "GET /features/weekly"               "$FT_INT"
    add_route "GET /features/weekly/availability"  "$FT_INT"
    add_route "POST /features/weekly/book"         "$FT_INT"
    add_route "GET /features/weekly/my-bookings"   "$FT_INT"

    # ── social-lambda ─────────────────────────────────────────────────────────
    SOC_INT=$(make_integration "social")
    add_route "GET /artworks/{artworkId}/comments"      "$SOC_INT"
    add_route "POST /artworks/{artworkId}/comments"     "$SOC_INT"
    add_route "DELETE /comments/{commentId}"            "$SOC_INT"
    add_route "PUT /artworks/{artworkId}/reactions"     "$SOC_INT"
    add_route "DELETE /artworks/{artworkId}/reactions"  "$SOC_INT"
    add_route "POST /follows/authors/{authorId}"        "$SOC_INT"
    add_route "DELETE /follows/authors/{authorId}"      "$SOC_INT"
    add_route "GET /follows/authors"                    "$SOC_INT"
    add_route "GET /users/me/notification-preferences"  "$SOC_INT"
    add_route "PUT /users/me/notification-preferences"  "$SOC_INT"
    add_route "GET /notifications/unsubscribe"          "$SOC_INT"

    # ── admin-lambda ──────────────────────────────────────────────────────────
    ADM_INT=$(make_integration "admin")
    add_route "ANY /admin/{proxy+}"  "$ADM_INT"

    success "  All routes registered — API URL: ${API_URL}"

    # Store Lambda ARNs in SSM (mirrors api-stack.ts SSM outputs)
    for fn_id in media artworks users subscriptions stripe-ingress subscriptions-webhook \
                 notifications features social admin maintenance; do
      ms_put_ssm "/duseum/local/stacks/api/${fn_id//-/_}_lambda_arn" \
        "$(ms_fn_arn "duseum-local-lambda-${fn_id}")" 2>/dev/null || true
    done
  else
    warn "  Route registration skipped (Lambdas not deployed)"
    warn "  Re-run without --no-lambdas to deploy Lambdas and register routes"
  fi

  # ═════════════════════════════════════════════════════════════════════════════
  # SECTION 17 — EventBridge rules + maintenance-lambda targets
  # NOTE: MiniStack supports creating rules and wiring Lambda targets. Scheduled
  # execution (cron) is not documented as supported — trigger maintenance-lambda
  # manually for testing: aws lambda invoke --function-name ... /tmp/out.json
  # ═════════════════════════════════════════════════════════════════════════════
  step "EventBridge rules"

  MAINT_ARN=$(ms_fn_arn "duseum-local-lambda-maintenance")

  for rule_spec in \
    "duseum-local-eventbridge-daily-featured-author|cron(0 0 * * ? *)" \
    "duseum-local-eventbridge-weekly-feature-rotation|cron(0 0 ? * MON *)"; do
    rule_name="${rule_spec%%|*}"
    schedule="${rule_spec##*|}"

    ms events put-rule \
      --name "$rule_name" \
      --schedule-expression "$schedule" \
      --state ENABLED \
      --output text >/dev/null 2>/dev/null || true

    if $DEPLOY_LAMBDAS; then
      ms events put-targets \
        --rule "$rule_name" \
        --targets "[{\"Id\":\"1\",\"Arn\":\"${MAINT_ARN}\"}]" \
        --output text >/dev/null 2>/dev/null || true
    fi
    success "  $rule_name"
  done

  # ═════════════════════════════════════════════════════════════════════════════
  # SECTION 18 — SES email identity verification
  # In MiniStack, emails are not sent — they are stored in-memory.
  # Inspect with: curl http://localhost:4566/_ministack/ses/messages
  # ═════════════════════════════════════════════════════════════════════════════
  step "SES email identity"
  ms ses verify-email-identity --email-address "no-reply@duseum.com" \
    --output text >/dev/null 2>/dev/null || true
  success "  no-reply@duseum.com verified (emails stored in MiniStack, not sent)"
  success "  Inspect sent emails: curl ${MINISTACK_ENDPOINT}/_ministack/ses/messages"

  # ═════════════════════════════════════════════════════════════════════════════
  # SUMMARY
  # ═════════════════════════════════════════════════════════════════════════════
  echo ""
  echo -e "${BOLD}${GREEN}════════════════════════════════════════════════════════════════${NC}"
  echo -e "${BOLD}${GREEN}  Local MiniStack bootstrap complete!${NC}"
  echo -e "${BOLD}${GREEN}════════════════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "${BOLD}API Gateway (MiniStack path-based URL):${NC}"
  echo "  ${API_URL}"
  echo ""
  echo -e "${BOLD}Dev server (Express proxy — hot-reload, recommended for frontend dev):${NC}"
  echo "  npm run dev:lambdas    # starts on http://localhost:3001"
  echo ""
  echo -e "${BOLD}Media (no CloudFront locally — served directly from S3):${NC}"
  echo "  http://localhost:4566/${MEDIA_BUCKET}/{key}"
  echo ""
  echo -e "${BOLD}SES messages (emails captured in MiniStack, not sent):${NC}"
  echo "  curl ${MINISTACK_ENDPOINT}/_ministack/ses/messages"
  echo ""
  echo -e "${BOLD}Trigger maintenance-lambda manually (cron scheduling not available):${NC}"
  echo "  AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \\"
  echo "  aws --endpoint-url ${MINISTACK_ENDPOINT} lambda invoke \\"
  echo "    --function-name duseum-local-lambda-maintenance /tmp/out.json"
  echo ""
  echo -e "${BOLD}Add to .env.local for the frontend:${NC}"
  echo "  VITE_API_URL=http://localhost:3001"
  echo "  VITE_COGNITO_USER_POOL_ID=${USER_POOL_ID}"
  echo "  VITE_COGNITO_CLIENT_ID=${USER_POOL_CLIENT_ID}"
  echo ""
  echo -e "${BOLD}${YELLOW}LIMITATIONS (see script header for full list):${NC}"
  echo "  • Cognito auth flows: use ENVIRONMENT=local JWT stub (no real sign-in)"
  echo "  • CloudFront CDN: not available — media served from S3"
  echo "  • WAF, Route53, X-Ray: stubs only"
  echo "  • EventBridge cron: rules stored but scheduled firing not supported"
  echo -e "${BOLD}${GREEN}════════════════════════════════════════════════════════════════${NC}"

  exit 0
fi  # end LOCAL_MODE

# ─── Static configuration ─────────────────────────────────────────────────────
AWS_PROFILE="rmw-llc"
AWS_ACCOUNT_ID="408141212087"
AWS_REGION="us-east-1"
GITHUB_ORG="ryanwaite28"
GITHUB_REPO_NAME="ai-projects-duseum"
GITHUB_REPO="${GITHUB_ORG}/${GITHUB_REPO_NAME}"
GITHUB_OIDC_URL="https://token.actions.githubusercontent.com"
GITHUB_OIDC_PROVIDER_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
SES_FROM_ADDRESS="no-reply@duseum.com"

# Non-secret Stripe values (publishable keys + connect client IDs are public)
DEV_STRIPE_PK="pk_test_51TMYUPDeejIUwJISEIUi0r8IOsg8Gb6RxS89dJwUYvjIVzN0igd3kwBd6tt98jCbEu67iQGq0dtDoPw710rivNZM007I5KcOzz"
DEV_STRIPE_CONNECT_CLIENT_ID="ca_ULF5h4bUlGnwEo3YRUioqoI8hogxwvcb"

PROD_STRIPE_PK="pk_live_51TMYUIRUKQLlSd6ofJWnGf8Tnci9anDOViecht16dv7YDqShJcCG7HMy4g65flctSC1aLJcrSfmBslKLwQAQ7zZ2005VYEc0FE"
PROD_STRIPE_CONNECT_CLIENT_ID="ca_ULF9jsCeRlmkF08gQBXwDqivNgiw38lA"

# ─── Load secrets from .secrets.env ───────────────────────────────────────────
SECRETS_FILE="${SCRIPT_DIR}/.secrets.env"
if [[ -f "$SECRETS_FILE" ]]; then
  info "Loading secrets from ${SECRETS_FILE}"
  set -a
  # shellcheck disable=SC1090
  source "$SECRETS_FILE"
  set +a
else
  warn "No .secrets.env found — expecting env vars to be pre-set."
  warn "Copy scripts/.secrets.env.example → scripts/.secrets.env and fill values."
fi

# Validate required secret env vars
: "${DEV_STRIPE_SK:?DEV_STRIPE_SK is not set — add it to scripts/.secrets.env}"
: "${DEV_STRIPE_WHSEC:?DEV_STRIPE_WHSEC is not set}"
: "${DEV_STRIPE_WHSEC_ACCOUNT:?DEV_STRIPE_WHSEC_ACCOUNT is not set — add it to scripts/.secrets.env}"
: "${PROD_STRIPE_SK:?PROD_STRIPE_SK is not set}"
: "${PROD_STRIPE_WHSEC:?PROD_STRIPE_WHSEC is not set}"
: "${PROD_STRIPE_WHSEC_ACCOUNT:?PROD_STRIPE_WHSEC_ACCOUNT is not set}"

# ─── Verify AWS credentials ────────────────────────────────────────────────────
step "Verifying AWS credentials"
CALLER_IDENTITY=$(aws sts get-caller-identity --profile "$AWS_PROFILE" --output json)
ACTUAL_ACCOUNT=$(echo "$CALLER_IDENTITY" | jq -r '.Account')
if [[ "$ACTUAL_ACCOUNT" != "$AWS_ACCOUNT_ID" ]]; then
  echo -e "${RED}ERROR: Authenticated to account $ACTUAL_ACCOUNT, expected $AWS_ACCOUNT_ID${NC}" >&2
  echo "Run: aws sso login --profile $AWS_PROFILE" >&2
  exit 1
fi
success "Authenticated to account $AWS_ACCOUNT_ID ($(echo "$CALLER_IDENTITY" | jq -r '.Arn'))"

# ─── Helper: AWS wrapper ───────────────────────────────────────────────────────
aws_cmd() { aws --profile "$AWS_PROFILE" --region "$AWS_REGION" "$@"; }

# ─── Helper: Secrets Manager ──────────────────────────────────────────────────
secret_exists() {
  aws_cmd secretsmanager describe-secret --secret-id "$1" &>/dev/null
}

# Upsert: creates if missing, updates value if exists
upsert_secret() {
  local name="$1" value="$2" env="$3"
  if secret_exists "$name"; then
    info "  Updating → $name"
    aws_cmd secretsmanager put-secret-value \
      --secret-id "$name" \
      --secret-string "$value" \
      --output text >/dev/null
  else
    info "  Creating → $name"
    aws_cmd secretsmanager create-secret \
      --name "$name" \
      --secret-string "$value" \
      --tags \
        "Key=Project,Value=duseum" \
        "Key=Environment,Value=${env}" \
        "Key=ManagedBy,Value=bootstrap" \
      --output text >/dev/null
  fi
  success "  $name"
}

# Create-once: skips if already exists (stable values — regenerating would break things)
create_secret_once() {
  local name="$1" value="$2" env="$3"
  if secret_exists "$name"; then
    success "  $name (exists — skipping)"
  else
    info "  Creating → $name"
    aws_cmd secretsmanager create-secret \
      --name "$name" \
      --secret-string "$value" \
      --tags \
        "Key=Project,Value=duseum" \
        "Key=Environment,Value=${env}" \
        "Key=ManagedBy,Value=bootstrap" \
      --output text >/dev/null
    success "  $name"
  fi
}

# ─── Helper: SSM Parameter Store ──────────────────────────────────────────────
ssm_param_exists() {
  aws_cmd ssm get-parameter --name "$1" &>/dev/null
}

put_ssm() {
  local name="$1" value="$2" env="$3"
  info "  SSM → $name"
  aws_cmd ssm put-parameter \
    --name "$name" \
    --value "$value" \
    --type String \
    --overwrite \
    --output text >/dev/null
  # Tag separately — --tags is unreliable with --overwrite in some CLI versions
  aws_cmd ssm add-tags-to-resource \
    --resource-type Parameter \
    --resource-id "$name" \
    --tags \
      "Key=Project,Value=duseum" \
      "Key=Environment,Value=${env}" \
      "Key=ManagedBy,Value=bootstrap" 2>/dev/null || true
  success "  $name"
}

get_ssm() {
  aws_cmd ssm get-parameter --name "$1" --query 'Parameter.Value' --output text
}

# ─── Helper: IAM ──────────────────────────────────────────────────────────────
iam_role_exists() {
  aws_cmd iam get-role --role-name "$1" &>/dev/null
}

policy_attached() {
  local role="$1" policy_arn="$2"
  aws_cmd iam list-attached-role-policies --role-name "$role" \
    --query "AttachedPolicies[?PolicyArn=='${policy_arn}'].PolicyArn" \
    --output text | grep -q "$policy_arn"
}

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 1 — Secrets Manager: DEV
# ═══════════════════════════════════════════════════════════════════════════════
step "Secrets Manager — DEV"

# Stripe (always update — keys may rotate)
upsert_secret "duseum/dev/stripe/secret-key"              "$DEV_STRIPE_SK"                "dev"
upsert_secret "duseum/dev/stripe/webhook-secret"          "$DEV_STRIPE_WHSEC"             "dev"
upsert_secret "duseum/dev/stripe/webhook-secret-account"  "$DEV_STRIPE_WHSEC_ACCOUNT"     "dev"
upsert_secret "duseum/dev/stripe/connect-client-id"       "$DEV_STRIPE_CONNECT_CLIENT_ID" "dev"

# Stable values (create once — never overwrite)
create_secret_once "duseum/dev/ses/from-address" "$SES_FROM_ADDRESS" "dev"

# Generate HMAC secret for one-click unsubscribe tokens (stable — regenerating invalidates email links)
create_secret_once "duseum/dev/notifications/unsubscribe-secret" "$(openssl rand -hex 32)" "dev"

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 2 — Secrets Manager: PROD
# ═══════════════════════════════════════════════════════════════════════════════
step "Secrets Manager — PROD"

upsert_secret "duseum/prod/stripe/secret-key"             "$PROD_STRIPE_SK"                "prod"
upsert_secret "duseum/prod/stripe/webhook-secret"         "$PROD_STRIPE_WHSEC"             "prod"
upsert_secret "duseum/prod/stripe/webhook-secret-account" "$PROD_STRIPE_WHSEC_ACCOUNT"     "prod"
upsert_secret "duseum/prod/stripe/connect-client-id"      "$PROD_STRIPE_CONNECT_CLIENT_ID" "prod"

create_secret_once "duseum/prod/ses/from-address" "$SES_FROM_ADDRESS" "prod"
create_secret_once "duseum/prod/notifications/unsubscribe-secret" "$(openssl rand -hex 32)" "prod"

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 3 — SSM: Stripe publishable keys (non-secret, public values)
# ═══════════════════════════════════════════════════════════════════════════════
step "SSM — Stripe publishable keys"
put_ssm "/duseum/dev/stripe/publishable_key"  "$DEV_STRIPE_PK"  "dev"
put_ssm "/duseum/prod/stripe/publishable_key" "$PROD_STRIPE_PK" "prod"

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 3.5 — CI/CD artifact bucket
#
# Shared bucket used by both dev and prod pipelines. Not environment-specific —
# isolation is via the S3 key prefix: {env}/lambda/{sha}/{name}/function.zip
#
# Name is intentionally free of the {env} segment (it serves both environments)
# and is stored in SSM so CDK stacks and scripts can reference it without
# hardcoding. The single known exception is _build-lambdas.yml, which must know
# the name before it can assume any role (chicken-and-egg).
#
# IAM: both deploy roles carry AdministratorAccess — no explicit bucket policy
# is required. Public access is blocked and SSE-S3 is applied for defence in depth.
# Lifecycle rules expire dev artifacts after 7 days and prod after 30 days to
# prevent unbounded accumulation.
# ═══════════════════════════════════════════════════════════════════════════════
step "CI/CD artifact bucket — duseum-cicd-artifacts"

CICD_BUCKET="duseum-cicd-artifacts"

if aws_cmd s3api head-bucket --bucket "$CICD_BUCKET" &>/dev/null; then
  success "  s3://${CICD_BUCKET} (exists — skipping create)"
else
  info "  Creating s3://${CICD_BUCKET}..."
  aws_cmd s3api create-bucket \
    --bucket "$CICD_BUCKET" \
    --region "$AWS_REGION" \
    --create-bucket-configuration "LocationConstraint=${AWS_REGION}" \
    --output text >/dev/null 2>/dev/null || \
  aws_cmd s3api create-bucket \
    --bucket "$CICD_BUCKET" \
    --region "$AWS_REGION" \
    --output text >/dev/null
  success "  s3://${CICD_BUCKET} created"
fi

# Block all public access
aws_cmd s3api put-public-access-block \
  --bucket "$CICD_BUCKET" \
  --public-access-block-configuration \
    'BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true' \
  --output text >/dev/null
success "  Public access blocked"

# Enable SSE-S3 (server-side encryption)
aws_cmd s3api put-bucket-encryption \
  --bucket "$CICD_BUCKET" \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"},
      "BucketKeyEnabled": true
    }]
  }' --output text >/dev/null
success "  SSE-S3 enabled"

# Lifecycle rules: expire dev artifacts after 7 days, prod after 30 days
aws_cmd s3api put-bucket-lifecycle-configuration \
  --bucket "$CICD_BUCKET" \
  --lifecycle-configuration '{
    "Rules": [
      {
        "ID": "expire-dev-artifacts",
        "Status": "Enabled",
        "Filter": {"Prefix": "dev/"},
        "Expiration": {"Days": 7}
      },
      {
        "ID": "expire-prod-artifacts",
        "Status": "Enabled",
        "Filter": {"Prefix": "prod/"},
        "Expiration": {"Days": 30}
      }
    ]
  }' --output text >/dev/null
success "  Lifecycle rules: dev/→7d, prod/→30d"

# Tag the bucket as shared infrastructure (not tied to one environment)
aws_cmd s3api put-bucket-tagging \
  --bucket "$CICD_BUCKET" \
  --tagging '{
    "TagSet": [
      {"Key": "Project",     "Value": "duseum"},
      {"Key": "Environment", "Value": "shared"},
      {"Key": "ManagedBy",   "Value": "bootstrap"}
    ]
  }' --output text >/dev/null
success "  Tags applied (Environment=shared)"

# Store bucket name in SSM — authoritative reference for CDK stacks and scripts
put_ssm "/duseum/cicd/artifact_bucket_name" "$CICD_BUCKET" "shared"
success "  SSM: /duseum/cicd/artifact_bucket_name = ${CICD_BUCKET}"

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 3.6 — DynamoDB config table seeding (dev + prod)
#
# CDK creates the config table but does NOT seed it. These keys must exist for
# features to work after first deploy. Idempotent — put-item overwrites safely.
#
# PLATFORM_SUB_PRICE_ID is seeded by Section 3.7 after the Stripe price is
# provisioned (or provided via DEV/PROD_STRIPE_PRICE_ID env var override).
# All other keys have static values seeded here.
#
# Local MiniStack equivalent: Section 8 (--local mode only).
# Sync rule: when adding a new config key, update here AND dep-check.sh
# REQUIRED_KEYS AND specs/infrastructure/environment-bootstrap.md.
# ═══════════════════════════════════════════════════════════════════════════════
seed_config_table() {
  local env="$1" price_id="${2:-REPLACE_WITH_STRIPE_PRICE_ID}"
  local table="duseum-${env}-dynamodb-config"

  step "DynamoDB config table seeding — ${env} (${table})"

  # PLATFORM_SUB_PRICE_ID: seeded with real price after Section 3.7,
  # or placeholder if Stripe provisioning hasn't run yet.
  aws_cmd dynamodb put-item --table-name "$table" \
    --item "{\"PK\":{\"S\":\"PLATFORM_SUB_PRICE_ID\"},\"value\":{\"S\":\"${price_id}\"}}" \
    --output text >/dev/null
  if [[ "$price_id" == "REPLACE_WITH_STRIPE_PRICE_ID" ]]; then
    warn "  PLATFORM_SUB_PRICE_ID — placeholder (Section 3.7 will update this)"
  else
    success "  PLATFORM_SUB_PRICE_ID = ${price_id}"
  fi

  aws_cmd dynamodb put-item --table-name "$table" \
    --item '{"PK":{"S":"PLATFORM_CUT_PERCENT"},"value":{"N":"20"}}' --output text >/dev/null
  success "  PLATFORM_CUT_PERCENT = 20"

  aws_cmd dynamodb put-item --table-name "$table" \
    --item '{"PK":{"S":"FREE_TIER_LIMIT"},"value":{"N":"5"}}' --output text >/dev/null
  success "  FREE_TIER_LIMIT = 5"

  aws_cmd dynamodb put-item --table-name "$table" \
    --item '{"PK":{"S":"WEEKLY_FEATURE_FEE_USD"},"value":{"N":"50"}}' --output text >/dev/null
  success "  WEEKLY_FEATURE_FEE_USD = 50"

  aws_cmd dynamodb put-item --table-name "$table" \
    --item '{"PK":{"S":"WEEKLY_FEATURE_SLOT_COUNT"},"value":{"N":"3"}}' --output text >/dev/null
  success "  WEEKLY_FEATURE_SLOT_COUNT = 3"

  aws_cmd dynamodb put-item --table-name "$table" \
    --item '{"PK":{"S":"WEEKLY_FEATURE_ADVANCE_WEEKS"},"value":{"N":"3"}}' --output text >/dev/null
  success "  WEEKLY_FEATURE_ADVANCE_WEEKS = 3"
}

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 3.7 — Stripe platform subscription product + price (dev + prod)
#
# Creates the Stripe Product and recurring Price used for platform subscriptions.
# The resulting price ID is stored in SSM (idempotency key for future re-runs)
# and seeded into the DynamoDB config table as PLATFORM_SUB_PRICE_ID.
#
# Idempotency: SSM key /duseum/{env}/stripe/platform_price_id is checked first.
# If present, creation is skipped and the existing price ID is used to re-seed
# the config table (safe to re-run if config table was cleared).
#
# Override: set DEV_STRIPE_PRICE_ID / PROD_STRIPE_PRICE_ID in .secrets.env to
# use an existing price instead of creating a new one (e.g., after key rotation
# or when the price was created outside this script).
# ═══════════════════════════════════════════════════════════════════════════════
provision_stripe_platform_price() {
  local env="$1" stripe_key="$2" price_id_override="${3:-}"
  local ssm_price_id="/duseum/${env}/stripe/platform_price_id"
  local table="duseum-${env}-dynamodb-config"

  step "Stripe platform subscription product + price — ${env}"

  # 1. Override provided: use it directly, skip Stripe API call
  if [[ -n "$price_id_override" ]]; then
    info "  Using provided price ID override: ${price_id_override}"
    put_ssm "$ssm_price_id" "$price_id_override" "$env"
    seed_config_table "$env" "$price_id_override"
    return
  fi

  # 2. Already provisioned: SSM has the price ID from a previous run
  if ssm_param_exists "$ssm_price_id"; then
    local existing_price
    existing_price=$(get_ssm "$ssm_price_id")
    success "  Stripe price already provisioned for ${env}: ${existing_price} (skipping creation)"
    # Re-seed config table in case it was cleared since last run
    seed_config_table "$env" "$existing_price"
    return
  fi

  # 3. First-time provisioning: create Stripe product + price
  info "  Creating Stripe product for ${env}..."
  PRODUCT_RESP=$(curl -sf -X POST "https://api.stripe.com/v1/products" \
    -u "${stripe_key}:" \
    -d "name=Platform Subscription" \
    -d "description=Duseum platform membership — unlimited access to all artworks" \
    2>/dev/null)
  if [[ -z "$PRODUCT_RESP" ]]; then
    echo -e "${RED}ERROR: Stripe product creation failed for ${env} — check stripe key in .secrets.env${NC}" >&2
    exit 1
  fi
  PRODUCT_ID=$(echo "$PRODUCT_RESP" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
  success "  Product: ${PRODUCT_ID}"

  info "  Creating Stripe price (\$10.00 USD/month) for ${env}..."
  PRICE_RESP=$(curl -sf -X POST "https://api.stripe.com/v1/prices" \
    -u "${stripe_key}:" \
    -d "product=${PRODUCT_ID}" \
    -d "unit_amount=1000" \
    -d "currency=usd" \
    -d "recurring[interval]=month" \
    2>/dev/null)
  if [[ -z "$PRICE_RESP" ]]; then
    echo -e "${RED}ERROR: Stripe price creation failed for ${env}${NC}" >&2
    exit 1
  fi
  PRICE_ID=$(echo "$PRICE_RESP" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
  success "  Price: ${PRICE_ID} (\$10.00/month)"

  # 4. Store in SSM — idempotency key for future re-runs
  put_ssm "$ssm_price_id" "$PRICE_ID" "$env"

  # 5. Seed config table with the real price ID
  seed_config_table "$env" "$PRICE_ID"
}

# Run Section 3.6 static keys first (placeholder for price), then Section 3.7
# which overwrites PLATFORM_SUB_PRICE_ID with the real provisioned price.
# DEV_STRIPE_PRICE_ID / PROD_STRIPE_PRICE_ID are optional override vars from
# .secrets.env — leave blank on first run; set on re-runs to skip Stripe API.
provision_stripe_platform_price "dev"  "$DEV_STRIPE_SK"  "${DEV_STRIPE_PRICE_ID:-}"
provision_stripe_platform_price "prod" "$PROD_STRIPE_SK" "${PROD_STRIPE_PRICE_ID:-}"

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 3.8 — DynamoDB FREE collection browse attr backfill (dev + prod)
#
# Collections created before FR-DISC-07 was deployed may lack the sparse
# collectionBrowse = 'FREE' attribute that GSI-AllFreeCollections relies on.
# Without this attribute, listFreeCollections() returns empty results and the
# Browse Collections page shows no content despite collections existing.
#
# This step scans the main table for FREE METADATA items missing the attribute
# and writes collectionBrowse = 'FREE' on each. Idempotent — the
# attribute_not_exists condition means re-runs are safe no-ops.
# ═══════════════════════════════════════════════════════════════════════════════
backfill_free_collection_browse_attr() {
  local env="$1"
  local table="duseum-${env}-dynamodb-main"

  step "DynamoDB FREE collection browse attr backfill — ${env}"
  info "  Scanning ${table} for FREE METADATA items missing collectionBrowse..."

  local items_json
  items_json=$(aws_cmd dynamodb scan \
    --table-name "$table" \
    --filter-expression "SK = :meta AND #vis = :free AND attribute_not_exists(collectionBrowse)" \
    --expression-attribute-names '{"#vis":"visibility"}' \
    --expression-attribute-values '{":meta":{"S":"METADATA"},":free":{"S":"FREE"}}' \
    --projection-expression "PK" \
    --no-paginate \
    --output json 2>/dev/null || echo '{"Items":[]}')

  local pks
  pks=$(echo "$items_json" | jq -r '.Items[].PK.S // empty' 2>/dev/null || echo "")

  if [[ -z "$pks" ]]; then
    success "  No FREE collections missing collectionBrowse — nothing to backfill"
    return
  fi

  local count
  count=$(echo "$pks" | grep -c .)
  info "  Found ${count} collection(s) to backfill..."

  while IFS= read -r pk; do
    [[ -z "$pk" ]] && continue
    aws_cmd dynamodb update-item \
      --table-name "$table" \
      --key "{\"PK\":{\"S\":\"${pk}\"},\"SK\":{\"S\":\"METADATA\"}}" \
      --update-expression "SET collectionBrowse = :browse" \
      --expression-attribute-values '{":browse":{"S":"FREE"}}' \
      --condition-expression "attribute_not_exists(collectionBrowse)" \
      --output text >/dev/null 2>/dev/null || true
    success "  ${pk}"
  done <<< "$pks"

  success "  Backfill complete — ${count} item(s) updated for ${env}"
}

backfill_free_collection_browse_attr "dev"
backfill_free_collection_browse_attr "prod"

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 4 — CloudFront RSA key pairs + key groups (for signed URLs)
# ═══════════════════════════════════════════════════════════════════════════════
provision_cloudfront_key() {
  local env="$1"
  local ssm_key_pair_id="/duseum/${env}/cloudfront/key_pair_id"
  local ssm_key_group_id="/duseum/${env}/cloudfront/key_group_id"
  local secret_name="duseum/${env}/cloudfront/private-key"
  local cf_key_name="duseum-${env}-cloudfront-signed-url-key"
  local cf_group_name="duseum-${env}-cloudfront-signed-url-key-group"

  step "CloudFront key pair + key group — ${env}"

  # Check if already provisioned (key pair ID in SSM is the source of truth)
  if ssm_param_exists "$ssm_key_pair_id"; then
    local existing_id existing_group_id
    existing_id=$(get_ssm "$ssm_key_pair_id")
    existing_group_id=$(get_ssm "$ssm_key_group_id" 2>/dev/null || echo "not-set")
    success "  Key pair already provisioned for ${env} (ID: ${existing_id})"
    success "  Key group: ${existing_group_id}"
    return
  fi

  # Generate RSA-2048 key pair into temp files, cleaned up on exit
  local priv_file pub_file
  priv_file=$(mktemp /tmp/duseum-cf-priv-XXXXXX.pem)
  pub_file=$(mktemp /tmp/duseum-cf-pub-XXXXXX.pem)
  cleanup_cf_keys() { rm -f "$priv_file" "$pub_file"; }
  trap cleanup_cf_keys EXIT

  info "  Generating RSA-2048 key pair for ${env}..."
  openssl genrsa -out "$priv_file" 2048 2>/dev/null
  openssl rsa -pubout -in "$priv_file" -out "$pub_file" 2>/dev/null

  # Build JSON config for CloudFront public key (write to temp file to avoid shell quoting issues)
  local cf_config_file
  cf_config_file=$(mktemp /tmp/duseum-cf-config-XXXXXX.json)
  jq -n \
    --arg ref "duseum-${env}-cf-key-$(date +%s)" \
    --arg name "$cf_key_name" \
    --arg key "$(cat "$pub_file")" \
    --arg comment "Duseum ${env} CloudFront signed URL key — managed by bootstrap.sh" \
    '{
      CallerReference: $ref,
      Name: $name,
      EncodedKey: $key,
      Comment: $comment
    }' > "$cf_config_file"

  # Upload public key to CloudFront (global — no --region needed)
  info "  Uploading public key to CloudFront for ${env}..."
  local key_pair_id
  key_pair_id=$(aws --profile "$AWS_PROFILE" cloudfront create-public-key \
    --public-key-config "file://${cf_config_file}" \
    --query 'PublicKey.Id' --output text)
  rm -f "$cf_config_file"
  success "  CloudFront public key ID: ${key_pair_id}"

  # Create key group referencing the public key
  info "  Creating CloudFront key group for ${env}..."
  local kg_config_file
  kg_config_file=$(mktemp /tmp/duseum-cf-kg-XXXXXX.json)
  jq -n \
    --arg name "$cf_group_name" \
    --arg key_id "$key_pair_id" \
    --arg comment "Duseum ${env} signed URL key group — managed by bootstrap.sh" \
    '{
      Name: $name,
      Items: [$key_id],
      Comment: $comment
    }' > "$kg_config_file"

  local key_group_id
  key_group_id=$(aws --profile "$AWS_PROFILE" cloudfront create-key-group \
    --key-group-config "file://${kg_config_file}" \
    --query 'KeyGroup.Id' --output text)
  rm -f "$kg_config_file"
  success "  CloudFront key group ID: ${key_group_id}"

  # Store private key in Secrets Manager (create-once — regenerating would break signed URLs)
  create_secret_once "$secret_name" "$(cat "$priv_file")" "$env"

  # Store IDs in SSM for CDK + Lambda to reference
  put_ssm "$ssm_key_pair_id" "$key_pair_id" "$env"
  put_ssm "$ssm_key_group_id" "$key_group_id" "$env"

  # Wipe temp key files
  cleanup_cf_keys
  trap - EXIT

  success "  CloudFront provisioning complete for ${env}"
}

provision_cloudfront_key "dev"
provision_cloudfront_key "prod"

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 5 — GitHub Actions OIDC provider
# ═══════════════════════════════════════════════════════════════════════════════
step "GitHub Actions OIDC provider"

if aws_cmd iam get-open-id-connect-provider \
    --open-id-connect-provider-arn "$GITHUB_OIDC_PROVIDER_ARN" &>/dev/null; then
  success "OIDC provider already exists — skipping"
else
  info "Creating OIDC provider for ${GITHUB_OIDC_URL}..."
  # Two known thumbprints for token.actions.githubusercontent.com
  aws_cmd iam create-open-id-connect-provider \
    --url "$GITHUB_OIDC_URL" \
    --client-id-list "sts.amazonaws.com" \
    --thumbprint-list \
      "6938fd4d98bab03faadb97b34396831e3780aea1" \
      "1c58a3a8518e8759bf075b76b750d4f2df264fcd" \
    --output text >/dev/null
  # Tag the OIDC provider
  aws_cmd iam tag-open-id-connect-provider \
    --open-id-connect-provider-arn "$GITHUB_OIDC_PROVIDER_ARN" \
    --tags \
      "Key=Project,Value=duseum" \
      "Key=ManagedBy,Value=bootstrap" 2>/dev/null || true
  success "OIDC provider created: ${GITHUB_OIDC_PROVIDER_ARN}"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 6 — IAM deploy roles for GitHub Actions
# ═══════════════════════════════════════════════════════════════════════════════
provision_deploy_role() {
  local env="$1"
  local role_name="duseum-github-actions-deploy-${env}"
  local ssm_role_arn="/duseum/${env}/iam/github_deploy_role_arn"

  step "IAM role — ${role_name}"

  # Trust policy: only jobs running in the matching GitHub Environment can assume this role
  local trust_policy
  trust_policy=$(jq -n \
    --arg oidc_arn "$GITHUB_OIDC_PROVIDER_ARN" \
    --arg sub "repo:${GITHUB_REPO}:environment:${env}" \
    '{
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { Federated: $oidc_arn },
          Action: "sts:AssumeRoleWithWebIdentity",
          Condition: {
            StringEquals: {
              "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
            },
            StringLike: {
              "token.actions.githubusercontent.com:sub": $sub
            }
          }
        }
      ]
    }')

  if iam_role_exists "$role_name"; then
    info "  Role already exists — refreshing trust policy"
    aws_cmd iam update-assume-role-policy \
      --role-name "$role_name" \
      --policy-document "$trust_policy" >/dev/null
    success "  Trust policy refreshed for ${role_name}"
  else
    info "  Creating role: ${role_name}"
    aws_cmd iam create-role \
      --role-name "$role_name" \
      --assume-role-policy-document "$trust_policy" \
      --description "GitHub Actions OIDC deploy role for Duseum ${env} - managed by bootstrap.sh" \
      --max-session-duration 3600 \
      --tags \
        "Key=Project,Value=duseum" \
        "Key=Environment,Value=${env}" \
        "Key=ManagedBy,Value=bootstrap" \
      --output text >/dev/null
    success "  Role created: ${role_name}"
  fi

  # Attach AdministratorAccess — CDK deploy requires broad permissions to create all AWS resources
  local admin_policy_arn="arn:aws:iam::aws:policy/AdministratorAccess"
  if policy_attached "$role_name" "$admin_policy_arn"; then
    success "  AdministratorAccess already attached"
  else
    info "  Attaching AdministratorAccess..."
    aws_cmd iam attach-role-policy \
      --role-name "$role_name" \
      --policy-arn "$admin_policy_arn" >/dev/null
    success "  AdministratorAccess attached"
  fi

  # Retrieve and store ARN in SSM
  local role_arn
  role_arn=$(aws_cmd iam get-role \
    --role-name "$role_name" \
    --query 'Role.Arn' --output text)
  put_ssm "$ssm_role_arn" "$role_arn" "$env"

  success "  ${role_name}: ${role_arn}"
}

provision_deploy_role "dev"
provision_deploy_role "prod"

# ── Build role — least-privilege, environment:build, S3-only ─────────────────
# Separate from the deploy roles so neither dev nor prod deployment is a
# prerequisite for running the build step. Decouples artifact upload from
# CDK deploy permissions and from any specific environment.
step "IAM role — duseum-github-actions-build"

BUILD_ROLE_NAME="duseum-github-actions-build"
BUILD_ROLE_SSM="/duseum/cicd/github_build_role_arn"

BUILD_TRUST=$(jq -n \
  --arg oidc_arn "$GITHUB_OIDC_PROVIDER_ARN" \
  --arg sub      "repo:${GITHUB_REPO}:environment:build" \
  '{
    Version: "2012-10-17",
    Statement: [{
      Effect: "Allow",
      Principal: { Federated: $oidc_arn },
      Action: "sts:AssumeRoleWithWebIdentity",
      Condition: {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        StringLike: {
          "token.actions.githubusercontent.com:sub": $sub
        }
      }
    }]
  }')

if iam_role_exists "$BUILD_ROLE_NAME"; then
  info "  Role already exists — refreshing trust policy"
  aws_cmd iam update-assume-role-policy \
    --role-name "$BUILD_ROLE_NAME" \
    --policy-document "$BUILD_TRUST" >/dev/null
  success "  Trust policy refreshed for ${BUILD_ROLE_NAME}"
else
  aws_cmd iam create-role \
    --role-name "$BUILD_ROLE_NAME" \
    --assume-role-policy-document "$BUILD_TRUST" \
    --description "GitHub Actions OIDC build role - s3:PutObject on duseum-cicd-artifacts only" \
    --max-session-duration 3600 \
    --tags \
      "Key=Project,Value=duseum" \
      "Key=Environment,Value=shared" \
      "Key=ManagedBy,Value=bootstrap" \
    --output text >/dev/null
  success "  Role created: ${BUILD_ROLE_NAME}"
fi

# Least-privilege inline policy — only what aws s3 cp needs to upload ZIPs
BUILD_POLICY=$(jq -n \
  --arg bucket_arn "arn:aws:s3:::duseum-cicd-artifacts" \
  '{
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "UploadArtifacts",
        Effect: "Allow",
        Action: ["s3:PutObject"],
        Resource: ($bucket_arn + "/*")
      },
      {
        Sid: "BucketLocation",
        Effect: "Allow",
        Action: ["s3:GetBucketLocation"],
        Resource: $bucket_arn
      }
    ]
  }')

aws_cmd iam put-role-policy \
  --role-name "$BUILD_ROLE_NAME" \
  --policy-name "duseum-cicd-artifact-upload" \
  --policy-document "$BUILD_POLICY" >/dev/null
success "  Inline policy: s3:PutObject + s3:GetBucketLocation on duseum-cicd-artifacts"

BUILD_ROLE_ARN=$(aws_cmd iam get-role \
  --role-name "$BUILD_ROLE_NAME" \
  --query 'Role.Arn' --output text)
put_ssm "$BUILD_ROLE_SSM" "$BUILD_ROLE_ARN" "shared"
success "  ${BUILD_ROLE_NAME}: ${BUILD_ROLE_ARN}"

# ═══════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════════════════════
DEV_ROLE_ARN=$(get_ssm "/duseum/dev/iam/github_deploy_role_arn")
PROD_ROLE_ARN=$(get_ssm "/duseum/prod/iam/github_deploy_role_arn")
BUILD_ROLE_ARN=$(get_ssm "/duseum/cicd/github_build_role_arn")
DEV_CF_KEY_ID=$(get_ssm "/duseum/dev/cloudfront/key_pair_id")
PROD_CF_KEY_ID=$(get_ssm "/duseum/prod/cloudfront/key_pair_id")

echo ""
echo -e "${BOLD}${GREEN}════════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}  Bootstrap complete!${NC}"
echo -e "${BOLD}${GREEN}════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BOLD}CI/CD artifact bucket:${NC}"
echo "  s3://duseum-cicd-artifacts"
echo "  dev/  → expires 7 days  |  prod/ → expires 30 days"
echo ""
echo -e "${BOLD}Next: add these as GitHub Actions secrets${NC}"
echo "  Repo → Settings → Secrets and variables → Actions:"
echo ""
echo "  AWS_ACCOUNT_ID           = ${AWS_ACCOUNT_ID}"
echo "  AWS_ROLE_ARN_BUILD       = ${BUILD_ROLE_ARN}"
echo "  AWS_ROLE_ARN_DEPLOY_DEV  = ${DEV_ROLE_ARN}"
echo "  AWS_ROLE_ARN_DEPLOY_PROD = ${PROD_ROLE_ARN}"
echo ""
echo -e "${BOLD}Next: create GitHub Environments${NC}"
echo "  Repo → Settings → Environments:"
echo "  • dev  (no protection rules)"
echo "  • prod (Required reviewers: your GitHub username)"
echo ""
echo -e "${BOLD}CloudFront key pair IDs (for CDK reference)${NC}"
echo "  dev:  ${DEV_CF_KEY_ID}"
echo "  prod: ${PROD_CF_KEY_ID}"
echo ""
echo -e "${BOLD}All IDs also stored in SSM at /duseum/{env}/...${NC}"
echo -e "${BOLD}${GREEN}════════════════════════════════════════════════════════════════${NC}"
