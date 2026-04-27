## Design: Messaging Stack (SQS)

**Spec**: `specs/infrastructure/messaging-stack.md`
**Status**: 🔒 Implemented
**Approved**: 2026-04-25
**Last updated**: 2026-04-25

---

### TypeScript Interfaces

```typescript
// infrastructure/stacks/messaging-stack.ts
export interface MessagingStackProps extends cdk.StackProps {
  readonly envName: string
}

export class MessagingStack extends cdk.Stack {
  public readonly stripeWebhookQueue: sqs.Queue
  public readonly stripeWebhookDlq: sqs.Queue
  public readonly notificationQueue: sqs.Queue
  public readonly notificationDlq: sqs.Queue
  public readonly adminAlertsTopic: sns.Topic
}
```

### DynamoDB Record Shapes

N/A — MessagingStack provisions SQS queues and SNS topic; no DynamoDB records.

### Function Signatures

N/A — CDK stack; no Lambda functions.

### CDK Construct Patterns

```typescript
// Stripe Webhook DLQ
this.stripeWebhookDlq = new sqs.Queue(this, 'StripeWebhookDlq', {
  queueName: `duseum-${envName}-sqs-stripe-webhooks-dlq`,
  retentionPeriod: cdk.Duration.days(14),
  encryption: sqs.QueueEncryption.SQS_MANAGED,
})

// Stripe Webhook Queue — 60s visibility timeout, max 3 receives → DLQ
this.stripeWebhookQueue = new sqs.Queue(this, 'StripeWebhookQueue', {
  queueName: `duseum-${envName}-sqs-stripe-webhooks`,
  visibilityTimeout: cdk.Duration.seconds(60),
  retentionPeriod: cdk.Duration.days(4),
  encryption: sqs.QueueEncryption.SQS_MANAGED,
  deadLetterQueue: { queue: this.stripeWebhookDlq, maxReceiveCount: 3 },
})

// Notification Fan-out DLQ + Queue
this.notificationDlq = new sqs.Queue(...)
this.notificationQueue = new sqs.Queue(this, 'NotificationQueue', {
  queueName: `duseum-${envName}-sqs-notifications`,
  // Default visibility timeout (30s — not overridden; spec said 300s)
  retentionPeriod: cdk.Duration.days(4),
  encryption: sqs.QueueEncryption.SQS_MANAGED,
  deadLetterQueue: { queue: this.notificationDlq, maxReceiveCount: 3 },
})

// SNS Admin Alerts Topic
this.adminAlertsTopic = new sns.Topic(this, 'AdminAlertsTopic', {
  topicName: `duseum-${envName}-sns-admin-alerts`,
})

// SSM outputs under /duseum/{env}/stacks/messaging/
// stripe_webhook_queue_url | stripe_webhook_queue_arn | stripe_webhook_dlq_url
// notification_queue_url | notification_queue_arn | notification_dlq_url | sns_admin_alerts_arn
```

### Implementation Steps

1. `MessagingStack` instantiated with `envName` prop.
2. Stack-level tags applied.
3. Stripe webhook DLQ created first (required by main queue's `deadLetterQueue` prop).
4. Stripe webhook queue created: 60s visibility timeout (Lambda Lambda processing time budget), 4-day retention, max 3 receives before DLQ.
5. Notification DLQ created; notification queue created: default 30s visibility timeout (not 300s as spec stated — notifications processing is fast).
6. SNS admin alerts topic created (no subscriptions wired in CDK — added manually).
7. 7 SSM parameters written under `/duseum/{env}/stacks/messaging/`.

Note: EventBridge rules are NOT created in MessagingStack — they are created in ApiStack alongside `maintenance-lambda` (CDK L2 `fromEventRuleArn()` returns IRule which does not support `addTarget()`, so rules that need Lambda targets must be co-located with the Lambda).

### Integration Test Fixtures

No integration tests found for MessagingStack CDK construct. `cdk synth --strict` validated in CI.

### Decisions & Constraints

- Notification queue visibility timeout uses the default (30s) rather than 300s — notifications-lambda processes SES sends quickly and 30s is adequate. The spec's 300s value was not implemented.
- CloudWatch alarms on DLQ depth are NOT created in MessagingStack — spec mentioned them but they are handled in `monitoring-stack.ts` instead.
- Stripe webhook endpoints (pre-provisioned in Stripe) are NOT recreated in CDK — the spec and CLAUDE.md both note this explicitly.
- `retentionPeriod: cdk.Duration.days(4)` on main queues — messages older than 4 days are discarded (Stripe events are time-sensitive; 4 days provides ample retry window).
- `encryption: sqs.QueueEncryption.SQS_MANAGED` — uses SQS-managed keys rather than customer-managed KMS to avoid KMS pricing and complexity in v1.
- SNS topic has no email subscriptions configured in CDK — operators add subscriptions manually or via `MonitoringStack`. The topic ARN is published to SSM for reference.
