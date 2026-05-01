## Spec: Monitoring Stack (CloudWatch + X-Ray)

**Status**: ✅ Implemented
**FR coverage**: NFR-OBS-01, NFR-OBS-02, NFR-OBS-03, NFR-OBS-04
**Relevant PROJECT.md sections**: 5, 13.5

**What this implements**: CDK MonitoringStack provisioning CloudWatch Dashboard, Lambda error alarms, API Gateway 5xx alarms, SQS DLQ alarms, X-Ray tracing enablement.

**Prerequisites**: All other stacks deployed (storage, auth, messaging, api, cdn); ops email address provided in CDK context for SNS subscription

**Done when**:
- [x] `cdk synth --strict --context env=dev` passes with zero warnings
- [x] 5 CloudWatch alarms created with correct thresholds and periods per the alarm table
- [x] CloudWatch Dashboard created with 4 metric sections (API GW, Lambda, DynamoDB, SQS)
- [x] SNS alert topic has at least one email subscription
- [x] All monitoring resources tagged `Project=duseum`, `Environment={env}`, `Stack=monitoring`, `ManagedBy=CDK`
- [x] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `infrastructure/stacks/monitoring-stack.ts` — CloudWatch dashboard, alarms, SNS topic for alerts

**CloudWatch alarms**:
| Alarm | Threshold | Period | Action |
|---|---|---|---|
| Lambda error rate | > 1% per function | 5 min | SNS alert |
| API GW 5xx rate | > 1% | 5 min | SNS alert |
| Stripe webhook DLQ depth | > 0 | 1 min | SNS alert |
| Notification DLQ depth | > 0 | 1 min | SNS alert |
| DynamoDB throttled requests | > 0 | 5 min | SNS alert |

**CloudWatch Dashboard** (`duseum-{env}-dashboard`):
- API Gateway: request volume, 4xx rate, 5xx rate, P99 latency
- Lambda: invocations, errors, duration P50/P95/P99 per function
- DynamoDB: consumed read/write capacity, throttled requests
- SQS: messages visible, DLQ depth

**X-Ray**:
- Enabled on all Lambda functions (active tracing)
- Enabled on API Gateway (all stages)

**SNS Alert Topic**:
- `duseum-{env}-sns-alerts`
- Email subscription: ops/engineering email (from CDK context)

**Tests to write**:
- CDK unit: alarms have correct thresholds; SNS topic has at least one subscription; X-Ray active tracing on Lambdas
