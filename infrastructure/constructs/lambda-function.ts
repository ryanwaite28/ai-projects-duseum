// =============================================================================
// infrastructure/constructs/lambda-function.ts
// Reusable DuseumLambdaFunction construct — Section 13.4 CDK conventions
//
// Defaults:
//   - Runtime:       Node.js 20, ARM64
//   - Tracing:       X-Ray active
//   - Log format:    Structured JSON
//   - Log retention: 14 days (dev) / 90 days (prod)
//   - Memory:        256 MB
//   - Timeout:       29 s (API GW max)
//   - Bundling:      esbuild (minify + source map)
// =============================================================================

import * as cdk from 'aws-cdk-lib'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as logs from 'aws-cdk-lib/aws-logs'
import { Construct } from 'constructs'

// ── Props ──────────────────────────────────────────────────────────────────────

export interface DuseumLambdaFunctionProps {
  /**
   * Absolute or workspace-relative path to the Lambda entry file (.ts).
   * Passed directly to NodejsFunction `entry`.
   */
  readonly entry: string

  /** Export name of the Lambda handler. Defaults to `'handler'`. */
  readonly handler?: string

  /** `'dev'` or `'prod'` — drives log retention and removal policy. */
  readonly envName: string

  /** Lambda memory in MB. Defaults to 256. */
  readonly memorySize?: number

  /** Lambda timeout. Defaults to 29 s (API GW maximum). */
  readonly timeout?: cdk.Duration

  /**
   * Hard limit on concurrent executions.
   * Omit to use account-level unreserved concurrency.
   */
  readonly reservedConcurrentExecutions?: number

  /** Additional environment variables injected alongside `ENVIRONMENT`. */
  readonly environment?: Record<string, string>

  /** Human-readable description shown in the Lambda console. */
  readonly description?: string

  /** Override or extend the default esbuild bundling options. */
  readonly bundling?: lambdaNodejs.BundlingOptions

  /** Additional inline IAM policy statements attached to the Lambda role. */
  readonly initialPolicy?: iam.PolicyStatement[]
}

// ── Construct ──────────────────────────────────────────────────────────────────

export class DuseumLambdaFunction extends Construct {
  /** The underlying Lambda function — use for event sources, grants, etc. */
  public readonly fn: lambdaNodejs.NodejsFunction

  /** Convenience reference to `fn.role` — always non-null for new functions. */
  public readonly role: iam.IRole

  constructor(scope: Construct, id: string, props: DuseumLambdaFunctionProps) {
    super(scope, id)

    const stack = cdk.Stack.of(this)
    const isProd = props.envName === 'prod'

    const logRetention = isProd
      ? logs.RetentionDays.THREE_MONTHS   // 90 days
      : logs.RetentionDays.TWO_WEEKS      // 14 days

    // Sanitise the construct id for use in the function name (lowercase, hyphens)
    const safeName = id.toLowerCase().replace(/[^a-z0-9-]/g, '-')

    // Explicit log group — avoids the deprecated `logRetention` prop
    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: `/aws/lambda/duseum-${props.envName}-lambda-${safeName}`,
      retention: logRetention,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    })

    this.fn = new lambdaNodejs.NodejsFunction(this, 'Fn', {
      functionName: `duseum-${props.envName}-lambda-${safeName}`,
      description: props.description,

      // ── Source ──────────────────────────────────────────────────────────────
      entry: props.entry,
      handler: props.handler ?? 'handler',

      // ── Runtime ─────────────────────────────────────────────────────────────
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,

      // ── Observability ───────────────────────────────────────────────────────
      tracing: lambda.Tracing.ACTIVE,
      logGroup,
      loggingFormat: lambda.LoggingFormat.JSON,
      applicationLogLevelV2: lambda.ApplicationLogLevel.INFO,
      systemLogLevelV2: lambda.SystemLogLevel.INFO,

      // ── Sizing ──────────────────────────────────────────────────────────────
      memorySize: props.memorySize ?? 256,
      timeout: props.timeout ?? cdk.Duration.seconds(29),
      reservedConcurrentExecutions: props.reservedConcurrentExecutions,

      // ── Bundling ─────────────────────────────────────────────────────────────
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node20',
        ...props.bundling,
      },

      // ── Environment ──────────────────────────────────────────────────────────
      environment: {
        ENVIRONMENT: props.envName,
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
        NODE_OPTIONS: '--enable-source-maps',
        ...props.environment,
      },

      initialPolicy: props.initialPolicy,
    })

    // role is always defined for newly-created functions
    this.role = this.fn.role!

    // ── Standard tags (Section 13.5) ─────────────────────────────────────────
    // Tag the whole construct subtree so the log retention custom resource
    // Lambda also picks up the tags.
    cdk.Tags.of(this).add('Project', 'duseum')
    cdk.Tags.of(this).add('Environment', props.envName)
    cdk.Tags.of(this).add('Stack', stack.stackName)
  }
}
