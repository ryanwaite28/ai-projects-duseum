// =============================================================================
// infrastructure/stacks/monitoring-stack.ts
// MonitoringStack — CloudWatch Dashboard, Alarms, X-Ray Groups
//
// Resources owned by this stack (Section 5.2):
//   - CloudWatch Dashboard: API traffic, Lambda errors/durations, DynamoDB
//     capacity, SQS queue depths (NFR-OBS-04)
//   - CloudWatch Alarms: Lambda error rate > 1% (×11), DLQ depth > 0 (×2),
//     API 5xx rate > 1% (×1) → SNS admin-alerts topic (NFR-OBS-02)
//   - X-Ray Groups: one per Lambda function (NFR-OBS-03)
//
// Cross-stack wiring via SSM only (Section 13.5).
// Lambda/queue names derived from the documented naming convention.
// API Gateway ID, SNS ARN, and DynamoDB table name read via valueFromLookup.
// =============================================================================

import * as cdk from 'aws-cdk-lib'
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch'
import * as cw_actions from 'aws-cdk-lib/aws-cloudwatch-actions'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as sns from 'aws-cdk-lib/aws-sns'
import * as sqs from 'aws-cdk-lib/aws-sqs'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import * as xray from 'aws-cdk-lib/aws-xray'
import { Construct } from 'constructs'

// ── Props ──────────────────────────────────────────────────────────────────────

export interface MonitoringStackProps extends cdk.StackProps {
  readonly envName: string
}

// ── Lambda function IDs (from DuseumLambdaFunction construct IDs in ApiStack) ─

const LAMBDA_IDS = [
  'media',
  'artworks',
  'users',
  'subscriptions',
  'stripe-ingress',
  'subscriptions-webhook',
  'notifications',
  'features',
  'social',
  'admin',
  'maintenance',
] as const

// ── Stack ──────────────────────────────────────────────────────────────────────

export class MonitoringStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props)

    const { envName } = props

    // ── Stack-level tags (Section 13.5) ───────────────────────────────────────
    cdk.Tags.of(this).add('Project', 'duseum')
    cdk.Tags.of(this).add('Environment', envName)
    cdk.Tags.of(this).add('Stack', this.stackName)

    // =========================================================================
    // SSM lookups (valueFromLookup — resolved at synth time)
    // =========================================================================

    const apiPrefix  = `/duseum/${envName}/stacks/api`
    const msgPrefix  = `/duseum/${envName}/stacks/messaging`
    const stgPrefix  = `/duseum/${envName}/stacks/storage`

    const apiGwId        = ssm.StringParameter.valueForStringParameter(this, `${apiPrefix}/api_gateway_id`)
    const snsAlertsArn   = ssm.StringParameter.valueForStringParameter(this, `${msgPrefix}/sns_admin_alerts_arn`)
    const mainTableName  = ssm.StringParameter.valueForStringParameter(this, `${stgPrefix}/dynamodb_main_table_name`)

    // =========================================================================
    // Import constructs from naming convention
    // =========================================================================

    // SNS admin-alerts topic (pre-existing, created by MessagingStack)
    const alertsTopic = sns.Topic.fromTopicArn(this, 'AdminAlertsTopic', snsAlertsArn)
    const alarmAction = new cw_actions.SnsAction(alertsTopic)

    // Lambda functions (imported by name — naming convention from lambda-function.ts L92)
    const lambdaFns = LAMBDA_IDS.map((fnId) =>
      lambda.Function.fromFunctionName(
        this,
        `Fn${fnId.replace(/-/g, '')}`,
        `duseum-${envName}-lambda-${fnId}`
      )
    )

    // SQS queues imported by ARN — constructed from known naming convention
    const sqsArn = (name: string) =>
      `arn:aws:sqs:${this.region}:${this.account}:${name}`

    // SQS DLQs (naming convention from MessagingStack)
    const stripeWebhookDlq = sqs.Queue.fromQueueArn(this, 'StripeWebhookDlq', sqsArn(`duseum-${envName}-sqs-stripe-webhooks-dlq`))
    const notificationDlq  = sqs.Queue.fromQueueArn(this, 'NotificationDlq',  sqsArn(`duseum-${envName}-sqs-notifications-dlq`))

    // SQS main queues (for dashboard depth widget)
    const stripeWebhookQueue = sqs.Queue.fromQueueArn(this, 'StripeWebhookQueue', sqsArn(`duseum-${envName}-sqs-stripe-webhooks`))
    const notificationQueue  = sqs.Queue.fromQueueArn(this, 'NotificationQueue',  sqsArn(`duseum-${envName}-sqs-notifications`))

    // =========================================================================
    // X-Ray Groups — one per Lambda (NFR-OBS-03)
    // =========================================================================

    for (const fnId of LAMBDA_IDS) {
      const functionName = `duseum-${envName}-lambda-${fnId}`
      new xray.CfnGroup(this, `XRayGroup${fnId.replace(/-/g, '')}`, {
        groupName: `duseum-${envName}-${fnId}`,
        filterExpression: `service(id(name: "${functionName}", type: "AWS::Lambda::Function"))`,
        insightsConfiguration: { insightsEnabled: false },
        tags: [
          { key: 'Project',     value: 'duseum' },
          { key: 'Environment', value: envName },
          { key: 'Stack',       value: this.stackName },
        ],
      })
    }

    // =========================================================================
    // CloudWatch Alarms
    // =========================================================================

    // ── Lambda error-rate alarms (×11) ────────────────────────────────────────
    // NFR-OBS-02: Lambda error rate > 1%
    // Math expression: errors / MAX([errors, invocations]) * 100
    // MAX avoids division-by-zero when invocations = 0.

    const period5m = cdk.Duration.minutes(5)

    for (let i = 0; i < LAMBDA_IDS.length; i++) {
      const fnId = LAMBDA_IDS[i]
      const fn   = lambdaFns[i]

      const errors      = fn.metricErrors({ period: period5m, statistic: 'Sum' })
      const invocations = fn.metricInvocations({ period: period5m, statistic: 'Sum' })

      const errorRateExpr = new cloudwatch.MathExpression({
        expression:   '(errors / MAX([errors, invocations])) * 100',
        usingMetrics: { errors, invocations },
        period:       period5m,
        label:        `${fnId} error rate %`,
      })

      const alarm = new cloudwatch.Alarm(this, `LambdaErrorRate${fnId.replace(/-/g, '')}`, {
        alarmName:           `duseum-${envName}-lambda-${fnId}-error-rate`,
        alarmDescription:    `Lambda ${fnId} error rate exceeded 1% over 3 consecutive 5-minute periods`,
        metric:              errorRateExpr,
        threshold:           1,
        evaluationPeriods:   3,
        comparisonOperator:  cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData:    cloudwatch.TreatMissingData.NOT_BREACHING,
        actionsEnabled:      true,
      })
      alarm.addAlarmAction(alarmAction)
      cdk.Tags.of(alarm).add('Project', 'duseum')
      cdk.Tags.of(alarm).add('Environment', envName)
      cdk.Tags.of(alarm).add('Stack', this.stackName)
    }

    // ── DLQ depth alarms (×2) ─────────────────────────────────────────────────
    // NFR-OBS-02: SQS DLQ message count > 0

    const dlqAlarms: [string, sqs.IQueue, string][] = [
      ['StripeDlqDepth',       stripeWebhookDlq, `duseum-${envName}-stripe-webhook-dlq-depth`],
      ['NotificationDlqDepth', notificationDlq,  `duseum-${envName}-notification-dlq-depth`],
    ]

    for (const [constructId, queue, alarmName] of dlqAlarms) {
      const alarm = new cloudwatch.Alarm(this, constructId, {
        alarmName,
        alarmDescription:   `${alarmName} — messages in DLQ indicate failed processing`,
        metric:             queue.metricApproximateNumberOfMessagesVisible({
          period:    cdk.Duration.minutes(1),
          statistic: 'Maximum',
        }),
        threshold:          0,
        evaluationPeriods:  1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData:   cloudwatch.TreatMissingData.NOT_BREACHING,
        actionsEnabled:     true,
      })
      alarm.addAlarmAction(alarmAction)
      cdk.Tags.of(alarm).add('Project', 'duseum')
      cdk.Tags.of(alarm).add('Environment', envName)
      cdk.Tags.of(alarm).add('Stack', this.stackName)
    }

    // ── API 5xx rate alarm (×1) ────────────────────────────────────────────────
    // NFR-OBS-02: API Gateway 5xx rate > 1%
    // HTTP API v2 metrics live in namespace AWS/ApiGateway with ApiId + Stage dims.

    const api5xxMetric = new cloudwatch.Metric({
      namespace:     'AWS/ApiGateway',
      metricName:    '5xx',
      dimensionsMap: { ApiId: apiGwId, Stage: '$default' },
      period:        period5m,
      statistic:     'Sum',
      label:         'API 5xx count',
    })
    const apiCountMetric = new cloudwatch.Metric({
      namespace:     'AWS/ApiGateway',
      metricName:    'Count',
      dimensionsMap: { ApiId: apiGwId, Stage: '$default' },
      period:        period5m,
      statistic:     'Sum',
      label:         'API total requests',
    })
    const api5xxRateExpr = new cloudwatch.MathExpression({
      expression:   '(fivexx / MAX([fivexx, count])) * 100',
      usingMetrics: { fivexx: api5xxMetric, count: apiCountMetric },
      period:       period5m,
      label:        'API 5xx rate %',
    })

    const api5xxAlarm = new cloudwatch.Alarm(this, 'Api5xxRate', {
      alarmName:          `duseum-${envName}-api-5xx-rate`,
      alarmDescription:   'HTTP API 5xx error rate exceeded 1% over 3 consecutive 5-minute periods',
      metric:             api5xxRateExpr,
      threshold:          1,
      evaluationPeriods:  3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData:   cloudwatch.TreatMissingData.NOT_BREACHING,
      actionsEnabled:     true,
    })
    api5xxAlarm.addAlarmAction(alarmAction)
    cdk.Tags.of(api5xxAlarm).add('Project', 'duseum')
    cdk.Tags.of(api5xxAlarm).add('Environment', envName)
    cdk.Tags.of(api5xxAlarm).add('Stack', this.stackName)

    // =========================================================================
    // CloudWatch Dashboard (NFR-OBS-04)
    // =========================================================================

    const dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: `duseum-${envName}-dashboard`,
    })

    // ── Row 1: API Traffic ────────────────────────────────────────────────────

    const apiLatencyP50 = new cloudwatch.Metric({
      namespace:     'AWS/ApiGateway',
      metricName:    'Latency',
      dimensionsMap: { ApiId: apiGwId, Stage: '$default' },
      period:        period5m,
      statistic:     'p50',
      label:         'Latency P50',
    })
    const apiLatencyP99 = new cloudwatch.Metric({
      namespace:     'AWS/ApiGateway',
      metricName:    'Latency',
      dimensionsMap: { ApiId: apiGwId, Stage: '$default' },
      period:        period5m,
      statistic:     'p99',
      label:         'Latency P99',
    })

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title:  'API Traffic — Request Count',
        width:  8,
        height: 6,
        left:   [apiCountMetric],
      }),
      new cloudwatch.GraphWidget({
        title:  'API Traffic — 5xx Errors',
        width:  8,
        height: 6,
        left:   [api5xxMetric],
      }),
      new cloudwatch.GraphWidget({
        title:  'API Latency (ms) — P50 / P99',
        width:  8,
        height: 6,
        left:   [apiLatencyP50, apiLatencyP99],
      }),
    )

    // ── Row 2: Lambda Error Counts ────────────────────────────────────────────

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title:  'Lambda Errors — All Functions',
        width:  24,
        height: 6,
        left:   lambdaFns.map((fn, i) =>
          fn.metricErrors({
            period:    period5m,
            statistic: 'Sum',
            label:     LAMBDA_IDS[i],
          })
        ),
      }),
    )

    // ── Row 3: Lambda Duration P50 / P95 / P99 ───────────────────────────────

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title:  'Lambda Duration P50 (ms)',
        width:  8,
        height: 6,
        left:   lambdaFns.map((fn, i) =>
          fn.metricDuration({ period: period5m, statistic: 'p50', label: LAMBDA_IDS[i] })
        ),
      }),
      new cloudwatch.GraphWidget({
        title:  'Lambda Duration P95 (ms)',
        width:  8,
        height: 6,
        left:   lambdaFns.map((fn, i) =>
          fn.metricDuration({ period: period5m, statistic: 'p95', label: LAMBDA_IDS[i] })
        ),
      }),
      new cloudwatch.GraphWidget({
        title:  'Lambda Duration P99 (ms)',
        width:  8,
        height: 6,
        left:   lambdaFns.map((fn, i) =>
          fn.metricDuration({ period: period5m, statistic: 'p99', label: LAMBDA_IDS[i] })
        ),
      }),
    )

    // ── Row 4: DynamoDB Consumed Capacity ─────────────────────────────────────

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title:  'DynamoDB Consumed Read Capacity',
        width:  12,
        height: 6,
        left: [new cloudwatch.Metric({
          namespace:     'AWS/DynamoDB',
          metricName:    'ConsumedReadCapacityUnits',
          dimensionsMap: { TableName: mainTableName },
          period:        period5m,
          statistic:     'Sum',
          label:         'Read CU',
        })],
      }),
      new cloudwatch.GraphWidget({
        title:  'DynamoDB Consumed Write Capacity',
        width:  12,
        height: 6,
        left: [new cloudwatch.Metric({
          namespace:     'AWS/DynamoDB',
          metricName:    'ConsumedWriteCapacityUnits',
          dimensionsMap: { TableName: mainTableName },
          period:        period5m,
          statistic:     'Sum',
          label:         'Write CU',
        })],
      }),
    )

    // ── Row 5: SQS Queue Depths ───────────────────────────────────────────────

    const sqsDepthMetric = (queue: sqs.IQueue, label: string) =>
      queue.metricApproximateNumberOfMessagesVisible({
        period:    cdk.Duration.minutes(5),
        statistic: 'Maximum',
        label,
      })

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title:  'SQS Queue Depths',
        width:  24,
        height: 6,
        left: [
          sqsDepthMetric(stripeWebhookQueue, 'stripe-webhook'),
          sqsDepthMetric(notificationQueue,  'notifications'),
          sqsDepthMetric(stripeWebhookDlq,   'stripe-webhook DLQ'),
          sqsDepthMetric(notificationDlq,    'notifications DLQ'),
        ],
      }),
    )

    cdk.Tags.of(dashboard).add('Project', 'duseum')
    cdk.Tags.of(dashboard).add('Environment', envName)
    cdk.Tags.of(dashboard).add('Stack', this.stackName)
  }
}
