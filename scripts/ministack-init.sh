#!/bin/sh
# =============================================================================
# scripts/ministack-init.sh
# MiniStack init script — Section 16.1
#
# Runs once inside duseum-ministack-init container after MiniStack is healthy.
# Creates all local AWS resources needed for local development.
# All resources use the 'duseum-local' naming convention.
# =============================================================================

set -e   # exit on any error

echo "=== Creating DynamoDB tables ==="

# Main table — all 6 GSIs from §4.7
aws dynamodb create-table \
  --table-name duseum-local \
  --attribute-definitions \
    AttributeName=PK,AttributeType=S \
    AttributeName=SK,AttributeType=S \
    AttributeName=authorId,AttributeType=S \
    AttributeName=status,AttributeType=S \
    AttributeName=tag,AttributeType=S \
    AttributeName=featureStatus,AttributeType=S \
    AttributeName=isoWeek,AttributeType=S \
    AttributeName=followedAt,AttributeType=S \
    AttributeName=subscribedAt,AttributeType=S \
  --key-schema \
    AttributeName=PK,KeyType=HASH \
    AttributeName=SK,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes \
    '[
      {"IndexName":"GSI-AuthorPublic","KeySchema":[{"AttributeName":"authorId","KeyType":"HASH"},{"AttributeName":"SK","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}},
      {"IndexName":"GSI-AllPublicPieces","KeySchema":[{"AttributeName":"status","KeyType":"HASH"},{"AttributeName":"SK","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}},
      {"IndexName":"GSI-FollowersByAuthor","KeySchema":[{"AttributeName":"authorId","KeyType":"HASH"},{"AttributeName":"followedAt","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}},
      {"IndexName":"GSI-SubscribersByAuthor","KeySchema":[{"AttributeName":"authorId","KeyType":"HASH"},{"AttributeName":"subscribedAt","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}},
      {"IndexName":"GSI-TagIndex","KeySchema":[{"AttributeName":"tag","KeyType":"HASH"},{"AttributeName":"SK","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}},
      {"IndexName":"GSI-WeeklyFeatureByStatus","KeySchema":[{"AttributeName":"featureStatus","KeyType":"HASH"},{"AttributeName":"isoWeek","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}}
    ]'

# Idempotency table (TTL on 'ttl' field enables dedup expiry)
aws dynamodb create-table \
  --table-name duseum-local-idempotency \
  --attribute-definitions AttributeName=PK,AttributeType=S \
  --key-schema AttributeName=PK,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

# Config table
aws dynamodb create-table \
  --table-name duseum-local-config \
  --attribute-definitions AttributeName=PK,AttributeType=S \
  --key-schema AttributeName=PK,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

echo "=== Seeding config table ==="

aws dynamodb put-item --table-name duseum-local-config \
  --item '{"PK":{"S":"FREE_TIER_LIMIT"},"value":{"N":"10"}}'
aws dynamodb put-item --table-name duseum-local-config \
  --item '{"PK":{"S":"PLATFORM_CUT_PERCENT"},"value":{"N":"20"}}'
aws dynamodb put-item --table-name duseum-local-config \
  --item '{"PK":{"S":"PLATFORM_SUB_PRICE_ID"},"value":{"S":"price_test_local"}}'
aws dynamodb put-item --table-name duseum-local-config \
  --item '{"PK":{"S":"FEATURED_AUTHORS"},"authorIds":{"L":[]}}'
aws dynamodb put-item --table-name duseum-local-config \
  --item '{"PK":{"S":"DAILY_FEATURED_AUTHOR"},"authorId":{"S":""},"selectedAt":{"S":""}}'
aws dynamodb put-item --table-name duseum-local-config \
  --item '{"PK":{"S":"DAILY_FEATURED_EXCLUSIONS"},"authorIds":{"L":[]}}'
aws dynamodb put-item --table-name duseum-local-config \
  --item '{"PK":{"S":"WEEKLY_FEATURE_FEE_USD"},"value":{"N":"25"}}'
aws dynamodb put-item --table-name duseum-local-config \
  --item '{"PK":{"S":"WEEKLY_FEATURE_SLOT_COUNT"},"value":{"N":"10"}}'
aws dynamodb put-item --table-name duseum-local-config \
  --item '{"PK":{"S":"WEEKLY_FEATURE_ADVANCE_WEEKS"},"value":{"N":"8"}}'

echo "=== Creating S3 buckets ==="

aws s3 mb s3://duseum-local-media
aws s3 mb s3://duseum-local-spa

echo "=== Creating SQS queues ==="

# Create DLQs first so we can reference their ARNs in the redrive policy
aws sqs create-queue --queue-name duseum-local-stripe-webhooks-dlq
aws sqs create-queue \
  --queue-name duseum-local-stripe-webhooks \
  --attributes '{"VisibilityTimeout":"60","RedrivePolicy":"{\"deadLetterTargetArn\":\"arn:aws:sqs:us-east-1:000000000000:duseum-local-stripe-webhooks-dlq\",\"maxReceiveCount\":\"3\"}"}'

aws sqs create-queue --queue-name duseum-local-notifications-dlq
aws sqs create-queue \
  --queue-name duseum-local-notifications \
  --attributes '{"RedrivePolicy":"{\"deadLetterTargetArn\":\"arn:aws:sqs:us-east-1:000000000000:duseum-local-notifications-dlq\",\"maxReceiveCount\":\"3\"}"}'

echo "=== Creating Secrets Manager secrets ==="

aws secretsmanager create-secret \
  --name duseum/local/stripe/secret-key \
  --secret-string sk_test_REPLACE_WITH_YOUR_TEST_KEY
aws secretsmanager create-secret \
  --name duseum/local/stripe/webhook-secret \
  --secret-string whsec_REPLACE_WITH_YOUR_WEBHOOK_SECRET
aws secretsmanager create-secret \
  --name duseum/local/cloudfront/private-key \
  --secret-string LOCAL_STUB_NOT_USED_FOR_SIGNING
aws secretsmanager create-secret \
  --name duseum/local/ses/from-address \
  --secret-string no-reply@duseum.com
aws secretsmanager create-secret \
  --name duseum/local/notifications/unsubscribe-secret \
  --secret-string local-dev-unsubscribe-hmac-secret

echo "=== Verifying SES email identity ==="

aws ses verify-email-identity --email-address no-reply@duseum.com

echo "=== Creating EventBridge rules ==="

aws events put-rule \
  --name duseum-local-daily-featured-author \
  --schedule-expression 'cron(0 0 * * ? *)' \
  --state ENABLED

aws events put-rule \
  --name duseum-local-weekly-feature-rotation \
  --schedule-expression 'cron(0 0 ? * MON *)' \
  --state ENABLED

echo "=== MiniStack init complete ==="
