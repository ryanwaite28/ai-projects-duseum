// =============================================================================
// infrastructure/constructs/duseum-stage.ts
// DuseumStage — full environment stage (dev or prod)
//
// Composes infrastructure stacks in the dependency order from §5.3:
//
//   StorageStack ─────────────────────────────────────────┐
//   AuthStack ────────────────────────────────────────────┤
//   MessagingStack ───────────────────────────────────────┤──► ApiStack
//   CdnStack (depends on Storage) ───────────────────────┘
//
// MonitoringStack added in a later prompt.
// =============================================================================

import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { ApiStack } from '../stacks/api-stack'
import { AuthStack } from '../stacks/auth-stack'
import { CdnStack } from '../stacks/cdn-stack'
import { MessagingStack } from '../stacks/messaging-stack'
import { MonitoringStack } from '../stacks/monitoring-stack'
import { StorageStack } from '../stacks/storage-stack'

// ── Props ──────────────────────────────────────────────────────────────────────

export interface DuseumStageProps extends cdk.StageProps {
  /** `'dev'` or `'prod'` */
  readonly envName: string

  /**
   * Git SHA of the commit being deployed.
   * Passed in from GitHub Actions via `--context sha=<sha>`.
   * Stored as a tag on all stacks for traceability.
   */
  readonly sha?: string
}

// ── Stage ──────────────────────────────────────────────────────────────────────

export class DuseumStage extends cdk.Stage {
  public readonly storageStack: StorageStack
  public readonly authStack: AuthStack
  public readonly messagingStack: MessagingStack
  public readonly cdnStack: CdnStack
  public readonly apiStack: ApiStack
  public readonly monitoringStack: MonitoringStack

  constructor(scope: Construct, id: string, props: DuseumStageProps) {
    super(scope, id, props)

    const { envName, sha } = props

    const commonStackProps: cdk.StackProps = {
      env: props.env,
      tags: {
        Project: 'duseum',
        Environment: envName,
        ...(sha ? { GitSha: sha } : {}),
      },
    }

    // ── StorageStack ──────────────────────────────────────────────────────────
    // No dependencies — provisioned first
    this.storageStack = new StorageStack(this, 'StorageStack', {
      ...commonStackProps,
      stackName: `duseum-${envName}-storage`,
      envName,
    })

    // ── AuthStack ─────────────────────────────────────────────────────────────
    // Depends on StorageStack (post-confirm trigger writes Viewer profile to DDB)
    this.authStack = new AuthStack(this, 'AuthStack', {
      ...commonStackProps,
      stackName: `duseum-${envName}-auth`,
      envName,
    })
    this.authStack.addDependency(this.storageStack)

    // ── MessagingStack ────────────────────────────────────────────────────────
    // Depends on StorageStack (SSM params for main table must exist at Lambda deploy)
    this.messagingStack = new MessagingStack(this, 'MessagingStack', {
      ...commonStackProps,
      stackName: `duseum-${envName}-messaging`,
      envName,
    })
    this.messagingStack.addDependency(this.storageStack)

    // ── CdnStack ──────────────────────────────────────────────────────────────
    // Depends on StorageStack — needs SPA + media bucket domain names for OAC
    // bucket policies. Must be deployed to us-east-1 (CloudFront + WAF CLOUDFRONT
    // scope constraint).
    this.cdnStack = new CdnStack(this, 'CdnStack', {
      ...commonStackProps,
      stackName: `duseum-${envName}-cdn`,
      // CfnWebACL CLOUDFRONT scope requires us-east-1 regardless of main region
      env: { ...props.env, region: 'us-east-1' },
      envName,
      spaBucketName:          this.storageStack.spaBucket.bucketName,
      spaBucketDomainName:    this.storageStack.spaBucket.bucketRegionalDomainName,
      mediaBucketName:        this.storageStack.mediaBucket.bucketName,
      mediaBucketDomainName:  this.storageStack.mediaBucket.bucketRegionalDomainName,
    })
    this.cdnStack.addDependency(this.storageStack)

    // ── ApiStack ──────────────────────────────────────────────────────────────
    // Depends on all prior stacks — reads SSM outputs from each at synth time
    // (valueForStringParameter) and at deploy time (env vars injected into Lambdas).
    this.apiStack = new ApiStack(this, 'ApiStack', {
      ...commonStackProps,
      stackName: `duseum-${envName}-api`,
      envName,
    })
    this.apiStack.addDependency(this.storageStack)
    this.apiStack.addDependency(this.authStack)
    this.apiStack.addDependency(this.messagingStack)
    this.apiStack.addDependency(this.cdnStack)

    // ── MonitoringStack ───────────────────────────────────────────────────────
    // Final stack — depends on ApiStack (needs Lambda ARNs for alarms/dashboard)
    this.monitoringStack = new MonitoringStack(this, 'MonitoringStack', {
      ...commonStackProps,
      stackName: `duseum-${envName}-monitoring`,
      envName,
    })
    this.monitoringStack.addDependency(this.apiStack)
  }
}
