## Spec: Messaging Stack (SQS)

**Status**: ✅ Implemented
**FR coverage**: NFR-REL-02, NFR-REL-04, FR-NOTIF-02, FR-NOTIF-09
**Relevant PROJECT.md sections**: 4.5, 4.6, 5, 13.5

**What this implements**: CDK MessagingStack provisioning Stripe webhook SQS queue + DLQ; notification fan-out SQS queue + DLQ; Stripe webhook destination wired to existing pre-provisioned endpoint.

**Prerequisites**: `storage-stack.md` deployed; ops email address available for SNS alert subscription

**Done when**:
- [x] `cdk synth --strict --context env=dev` passes with zero warnings
- [x] Both SQS queues created with correct visibility timeouts (30s Stripe, 300s notifications)
- [x] Both DLQs wired to main queues with `maxReceiveCount=3`
- [x] CloudWatch alarms on both DLQs fire to SNS when depth > 0
- [x] 6 SSM outputs written under `/duseum/{env}/stacks/messaging/`
- [x] Stripe webhook endpoints NOT recreated in CDK (pre-provisioned in Stripe accounts)
- [x] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `infrastructure/stacks/messaging-stack.ts` — SQS queues, DLQs, CloudWatch alarms

**SQS queues**:
| Queue | Purpose | Visibility Timeout | Max Receives | DLQ |
|---|---|---|---|---|
| `duseum-{env}-sqs-stripe-webhooks` | Stripe → subscriptions-webhook-lambda | 30s | 3 | `…-dlq` |
| `duseum-{env}-sqs-notifications` | artworks-lambda → notifications-lambda | 300s | 3 | `…-dlq` |

**CloudWatch alarms**:
- DLQ message count > 0 → SNS alert (NFR-OBS-02)

**SSM outputs** (`/duseum/{env}/stacks/messaging/`):
- `sqs_stripe_webhook_queue_url`
- `sqs_stripe_webhook_queue_arn`
- `sqs_notifications_queue_url`
- `sqs_notifications_queue_arn`
- `sqs_stripe_dlq_arn`
- `sqs_notifications_dlq_arn`

**Note on Stripe webhook endpoint**: The Stripe webhook endpoints (`we_1TMiBcDeejIUwJISRTd0wITw` for dev, `we_1TMiH8RUKQLlSd6oP9UMFQ3C` for prod) are pre-provisioned in the respective Stripe accounts. They point to `https://api.{env}.duseum.com/webhooks/stripe` and forward to this SQS queue. Do not recreate in CDK.

**Tags**: `Project=duseum`, `Environment={env}`, `Stack=messaging`, `ManagedBy=CDK`

**Tests to write**:
- CDK unit: queue visibility timeouts correct; DLQ wired to main queue; alarms reference DLQ ARN
