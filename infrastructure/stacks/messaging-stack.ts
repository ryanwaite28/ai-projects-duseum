// =============================================================================
// infrastructure/stacks/messaging-stack.ts
// MessagingStack — SQS, SNS, SSM outputs
//
// Resources owned by this stack (Section 5.2):
//   - SQS  duseum-{env}-sqs-stripe-webhooks          (vis=60s) + DLQ
//   - SQS  duseum-{env}-sqs-notifications             + DLQ
//   - SNS  duseum-{env}-sns-admin-alerts
//   - SSM params   /duseum/{env}/stacks/messaging/*
//
// Note: EventBridge rules (daily-featured-author, weekly-feature-rotation) are
// defined in ApiStack alongside the maintenance-lambda they target. CDK's
// fromEventRuleArn() returns IRule which does not support addTarget(), so rules
// that need Lambda targets must be created in the same stack as the Lambda.
// =============================================================================

import * as cdk from 'aws-cdk-lib'
import * as sns from 'aws-cdk-lib/aws-sns'
import * as sqs from 'aws-cdk-lib/aws-sqs'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import { Construct } from 'constructs'

// ── Props ──────────────────────────────────────────────────────────────────────

export interface MessagingStackProps extends cdk.StackProps {
  readonly envName: string
}

// ── Stack ──────────────────────────────────────────────────────────────────────

export class MessagingStack extends cdk.Stack {
  public readonly stripeWebhookQueue: sqs.Queue
  public readonly stripeWebhookDlq: sqs.Queue
  public readonly notificationQueue: sqs.Queue
  public readonly notificationDlq: sqs.Queue
  public readonly adminAlertsTopic: sns.Topic

  constructor(scope: Construct, id: string, props: MessagingStackProps) {
    super(scope, id, props)

    const { envName } = props

    // ── Stack-level tags (Section 13.5) ───────────────────────────────────────
    cdk.Tags.of(this).add('Project', 'duseum')
    cdk.Tags.of(this).add('Environment', envName)
    cdk.Tags.of(this).add('Stack', this.stackName)

    // =========================================================================
    // SQS — Stripe Webhooks (API GW → SQS → subscriptions-webhook-lambda)
    // Section 4.5: webhook processing must be idempotent; vis=60s gives the
    // Lambda time to verify, process, and delete the message before redelivery.
    // =========================================================================

    this.stripeWebhookDlq = new sqs.Queue(this, 'StripeWebhookDlq', {
      queueName: `duseum-${envName}-sqs-stripe-webhooks-dlq`,
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    })

    this.stripeWebhookQueue = new sqs.Queue(this, 'StripeWebhookQueue', {
      queueName: `duseum-${envName}-sqs-stripe-webhooks`,
      visibilityTimeout: cdk.Duration.seconds(60),
      retentionPeriod: cdk.Duration.days(4),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      deadLetterQueue: {
        queue: this.stripeWebhookDlq,
        maxReceiveCount: 3,
      },
    })

    // =========================================================================
    // SQS — Notifications Fan-out (artworks-lambda → notifications-lambda)
    // Section 4.6: artworks-lambda sends ONE message and returns; all fan-out
    // logic lives exclusively in notifications-lambda.
    // =========================================================================

    this.notificationDlq = new sqs.Queue(this, 'NotificationDlq', {
      queueName: `duseum-${envName}-sqs-notifications-dlq`,
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    })

    this.notificationQueue = new sqs.Queue(this, 'NotificationQueue', {
      queueName: `duseum-${envName}-sqs-notifications`,
      // Default visibility timeout (30 s) — notifications-lambda processes fast
      retentionPeriod: cdk.Duration.days(4),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      deadLetterQueue: {
        queue: this.notificationDlq,
        maxReceiveCount: 3,
      },
    })

    // =========================================================================
    // SNS — Admin Alerts (CloudWatch alarm actions, DLQ depth, etc.)
    // =========================================================================

    this.adminAlertsTopic = new sns.Topic(this, 'AdminAlertsTopic', {
      topicName: `duseum-${envName}-sns-admin-alerts`,
      displayName: `Duseum ${envName} Admin Alerts`,
      // No subscriptions here — added manually (email) or via MonitoringStack
    })

    // =========================================================================
    // SSM Outputs — /duseum/{env}/stacks/messaging/*  (Section 5.4)
    // =========================================================================

    const ssmPrefix = `/duseum/${envName}/stacks/messaging`

    new ssm.StringParameter(this, 'SsmStripeQueueUrl', {
      parameterName: `${ssmPrefix}/stripe_webhook_queue_url`,
      stringValue: this.stripeWebhookQueue.queueUrl,
      description: `[${envName}] Stripe webhook SQS queue URL`,
    })

    new ssm.StringParameter(this, 'SsmStripeQueueArn', {
      parameterName: `${ssmPrefix}/stripe_webhook_queue_arn`,
      stringValue: this.stripeWebhookQueue.queueArn,
      description: `[${envName}] Stripe webhook SQS queue ARN`,
    })

    new ssm.StringParameter(this, 'SsmStripeDlqUrl', {
      parameterName: `${ssmPrefix}/stripe_webhook_dlq_url`,
      stringValue: this.stripeWebhookDlq.queueUrl,
      description: `[${envName}] Stripe webhook DLQ URL`,
    })

    new ssm.StringParameter(this, 'SsmNotificationQueueUrl', {
      parameterName: `${ssmPrefix}/notification_queue_url`,
      stringValue: this.notificationQueue.queueUrl,
      description: `[${envName}] Notification fan-out SQS queue URL`,
    })

    new ssm.StringParameter(this, 'SsmNotificationQueueArn', {
      parameterName: `${ssmPrefix}/notification_queue_arn`,
      stringValue: this.notificationQueue.queueArn,
      description: `[${envName}] Notification fan-out SQS queue ARN`,
    })

    new ssm.StringParameter(this, 'SsmNotificationDlqUrl', {
      parameterName: `${ssmPrefix}/notification_dlq_url`,
      stringValue: this.notificationDlq.queueUrl,
      description: `[${envName}] Notification DLQ URL`,
    })

    new ssm.StringParameter(this, 'SsmAdminAlertsArn', {
      parameterName: `${ssmPrefix}/sns_admin_alerts_arn`,
      stringValue: this.adminAlertsTopic.topicArn,
      description: `[${envName}] Admin alerts SNS topic ARN`,
    })
  }
}
