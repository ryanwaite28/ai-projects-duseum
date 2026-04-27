// =============================================================================
// infrastructure/constructs/lambda-function.ts
// Reusable DuseumLambdaFunction construct — Section 13.4 CDK conventions
//
// Code source: pre-built ZIP from the CI/CD artifact bucket.
//   s3://duseum-cicd-artifacts/lambda/{sha}/{lambdaName}/function.zip
//
// The SHA is read from CDK context (--context sha=<git-sha>).
// Both dev and prod reference the same artifact for the same SHA —
// build-once, deploy-many (JS is architecture-agnostic).
//
// Defaults:
//   - Runtime:       Node.js 20, ARM64
//   - Tracing:       X-Ray active
//   - Log format:    Structured JSON
//   - Log retention: 14 days (dev) / 90 days (prod)
//   - Memory:        256 MB
//   - Timeout:       29 s (API GW max)
// =============================================================================

import * as cdk from 'aws-cdk-lib'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as s3 from 'aws-cdk-lib/aws-s3'
import { Construct } from 'constructs'

// ── Props ──────────────────────────────────────────────────────────────────────

export interface DuseumLambdaFunctionProps {
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

  /** Additional inline IAM policy statements attached to the Lambda role. */
  readonly initialPolicy?: iam.PolicyStatement[]
}

// ── Construct ──────────────────────────────────────────────────────────────────

export class DuseumLambdaFunction extends Construct {
  /** The underlying Lambda function — use for event sources, grants, etc. */
  public readonly fn: lambda.Function

  /** Convenience reference to `fn.role` — always non-null for new functions. */
  public readonly role: iam.IRole

  constructor(scope: Construct, id: string, props: DuseumLambdaFunctionProps) {
    super(scope, id)

    const stack = cdk.Stack.of(this)
    const isProd = props.envName === 'prod'

    // SHA from CDK context — forms the S3 artifact key.
    // Passed by GitHub Actions via --context sha=<git-sha>.
    // In CI synth (ci.yml) a placeholder SHA is passed to allow credential-free synth.
    const sha = this.node.tryGetContext('sha') as string | undefined
    if (!sha) throw new Error('Missing CDK context: sha — pass --context sha=<git-sha> to cdk deploy')

    const logRetention = isProd
      ? logs.RetentionDays.THREE_MONTHS   // 90 days
      : logs.RetentionDays.TWO_WEEKS      // 14 days

    // Sanitise the construct id for use in the function name and S3 key
    const safeName = id.toLowerCase().replace(/[^a-z0-9-]/g, '-')

    // Explicit log group — avoids the deprecated `logRetention` prop
    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: `/aws/lambda/duseum-${props.envName}-lambda-${safeName}`,
      retention: logRetention,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    })

    // Pre-built artifact from the shared CI/CD bucket (created by bootstrap.sh).
    // Using fromBucketName avoids a CDK lookup call — bucket is pre-provisioned.
    const artifactBucket = s3.Bucket.fromBucketName(this, 'ArtifactBucket', 'duseum-cicd-artifacts')

    // The S3 key includes the git SHA so CloudFormation detects code changes via
    // key change — objectVersion is not needed. Ack is placed on `this` (parent of
    // `Fn`) so the context traversal from Fn → DuseumLambdaFunction finds it.
    cdk.Annotations.of(this).acknowledgeWarning(
      '@aws-cdk/aws-lambda:codeFromBucketObjectVersionNotSpecified',
      'S3 key contains git SHA — CF detects changes via key, not object version.',
    )

    this.fn = new lambda.Function(this, 'Fn', {
      functionName: `duseum-${props.envName}-lambda-${safeName}`,
      description: props.description,

      // ── Source ──────────────────────────────────────────────────────────────
      // Pre-built by _build-lambdas.yml; key is {env}/lambda/{sha}/{name}/function.zip.
      code: lambda.Code.fromBucket(artifactBucket, `${props.envName}/lambda/${sha}/${safeName}/function.zip`),
      handler: 'index.handler',

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

      // ── Environment ──────────────────────────────────────────────────────────
      environment: {
        ENVIRONMENT: props.envName,
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
        NODE_OPTIONS: '--enable-source-maps',
        ...props.environment,
      },

      initialPolicy: props.initialPolicy,
    })

    // Lambda execution role needs s3:GetObject on the artifact bucket to load code.
    artifactBucket.grantRead(this.fn)

    // role is always defined for newly-created functions
    this.role = this.fn.role!

    // ── Standard tags (Section 13.5) ─────────────────────────────────────────
    cdk.Tags.of(this).add('Project', 'duseum')
    cdk.Tags.of(this).add('Environment', props.envName)
    cdk.Tags.of(this).add('Stack', stack.stackName)
  }
}
