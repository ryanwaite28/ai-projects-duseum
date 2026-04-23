#!/usr/bin/env bash
# =============================================================================
# scripts/bootstrap.sh — Duseum Phase 0 Provisioning
# =============================================================================
#
# Idempotent: safe to run multiple times.
# Each section checks existing state and skips if already provisioned.
#
# What this script provisions:
#   1. Secrets Manager — all runtime secrets (dev + prod)
#   2. SSM Parameter Store — non-secret config values (dev + prod)
#   3. CloudFront RSA key pairs — for signed URLs (dev + prod, generated once)
#   4. CloudFront key groups — referencing the key pairs (dev + prod)
#   5. GitHub Actions OIDC provider — one per account
#   6. GitHub Actions IAM deploy roles — duseum-github-actions-deploy-{dev|prod}
#
# USAGE:
#   1. Copy scripts/.secrets.env.example → scripts/.secrets.env
#   2. Fill in your secret values in scripts/.secrets.env
#   3. aws sso login --profile rmw-llc
#   4. bash scripts/bootstrap.sh
#
# REQUIREMENTS: aws-cli v2, openssl, jq
#
# ⚠ WARNING: scripts/.secrets.env contains live secrets.
#   It is gitignored. NEVER commit it. NEVER share it.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ─── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[ OK ]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
step()    { echo -e "\n${BOLD}${BLUE}══════ $* ══════${NC}"; }
banner()  { echo -e "\n${BOLD}$*${NC}"; }

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
: "${PROD_STRIPE_SK:?PROD_STRIPE_SK is not set}"
: "${PROD_STRIPE_WHSEC:?PROD_STRIPE_WHSEC is not set}"

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
upsert_secret "duseum/dev/stripe/secret-key"       "$DEV_STRIPE_SK"               "dev"
upsert_secret "duseum/dev/stripe/webhook-secret"   "$DEV_STRIPE_WHSEC"            "dev"
upsert_secret "duseum/dev/stripe/connect-client-id" "$DEV_STRIPE_CONNECT_CLIENT_ID" "dev"

# Stable values (create once — never overwrite)
create_secret_once "duseum/dev/ses/from-address" "$SES_FROM_ADDRESS" "dev"

# Generate HMAC secret for one-click unsubscribe tokens (stable — regenerating invalidates email links)
create_secret_once "duseum/dev/notifications/unsubscribe-secret" "$(openssl rand -hex 32)" "dev"

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 2 — Secrets Manager: PROD
# ═══════════════════════════════════════════════════════════════════════════════
step "Secrets Manager — PROD"

upsert_secret "duseum/prod/stripe/secret-key"       "$PROD_STRIPE_SK"               "prod"
upsert_secret "duseum/prod/stripe/webhook-secret"   "$PROD_STRIPE_WHSEC"            "prod"
upsert_secret "duseum/prod/stripe/connect-client-id" "$PROD_STRIPE_CONNECT_CLIENT_ID" "prod"

create_secret_once "duseum/prod/ses/from-address" "$SES_FROM_ADDRESS" "prod"
create_secret_once "duseum/prod/notifications/unsubscribe-secret" "$(openssl rand -hex 32)" "prod"

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 3 — SSM: Stripe publishable keys (non-secret, public values)
# ═══════════════════════════════════════════════════════════════════════════════
step "SSM — Stripe publishable keys"
put_ssm "/duseum/dev/stripe/publishable_key"  "$DEV_STRIPE_PK"  "dev"
put_ssm "/duseum/prod/stripe/publishable_key" "$PROD_STRIPE_PK" "prod"

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

# ═══════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════════════════════
DEV_ROLE_ARN=$(get_ssm "/duseum/dev/iam/github_deploy_role_arn")
PROD_ROLE_ARN=$(get_ssm "/duseum/prod/iam/github_deploy_role_arn")
DEV_CF_KEY_ID=$(get_ssm "/duseum/dev/cloudfront/key_pair_id")
PROD_CF_KEY_ID=$(get_ssm "/duseum/prod/cloudfront/key_pair_id")

echo ""
echo -e "${BOLD}${GREEN}════════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}  Bootstrap complete!${NC}"
echo -e "${BOLD}${GREEN}════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BOLD}Next: add these as GitHub Actions secrets${NC}"
echo "  Repo → Settings → Secrets and variables → Actions:"
echo ""
echo "  AWS_ACCOUNT_ID    = ${AWS_ACCOUNT_ID}"
echo "  AWS_ROLE_ARN_DEV  = ${DEV_ROLE_ARN}"
echo "  AWS_ROLE_ARN_PROD = ${PROD_ROLE_ARN}"
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
