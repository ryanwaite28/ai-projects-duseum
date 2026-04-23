// =============================================================================
// infrastructure/stacks/cdn-stack.ts
// CdnStack — CloudFront distributions, WAF, Route53 aliases, SSM outputs
//
// Resources owned by this stack (Section 5.2):
//   - CloudFront distribution (SPA)   duseum-{env}-cloudfront-app
//   - CloudFront distribution (media) duseum-{env}-cloudfront-media
//   - WAF WebACL (CLOUDFRONT scope)   duseum-{env}-waf-cloudfront
//   - Route53 A records               {env}.duseum.com, media.{env}.duseum.com
//   - SSM params                      /duseum/{env}/stacks/cdn/*
//
// Pre-provisioned (NEVER re-created):
//   - ACM certificate — read from CDK context certArn.{env}
//   - Route53 hosted zone — HostedZone.fromLookup(domainName: 'duseum.com')
//   - CloudFront key pair — ID from CDK context cloudfrontKeyPairId.{env}
//
// L1 constructs used throughout (CfnDistribution, CfnOriginAccessControl,
// CfnKeyGroup) because L2 lacks native OAC + trusted-key-group support.
//
// Cross-stack wiring via SSM only (Section 13.5 / Rule 15).
// =============================================================================

import * as cdk from 'aws-cdk-lib'
import * as acm from 'aws-cdk-lib/aws-certificatemanager'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as route53 from 'aws-cdk-lib/aws-route53'
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import * as wafv2 from 'aws-cdk-lib/aws-wafv2'
import { Construct } from 'constructs'

// ── Props ──────────────────────────────────────────────────────────────────────

export interface CdnStackProps extends cdk.StackProps {
  readonly envName: string
  /** S3 SPA bucket name (from StorageStack SSM — passed in from DuseumStage) */
  readonly spaBucketName: string
  /** S3 SPA bucket regional domain name */
  readonly spaBucketDomainName: string
  /** S3 media bucket name */
  readonly mediaBucketName: string
  /** S3 media bucket regional domain name */
  readonly mediaBucketDomainName: string
}

// ── Stack ──────────────────────────────────────────────────────────────────────

export class CdnStack extends cdk.Stack {
  public readonly appDistributionId: string
  public readonly appDistributionDomainName: string
  public readonly mediaDistributionId: string
  public readonly mediaDistributionDomainName: string

  constructor(scope: Construct, id: string, props: CdnStackProps) {
    super(scope, id, props)

    const { envName, spaBucketName, spaBucketDomainName, mediaBucketName, mediaBucketDomainName } = props
    const isProd = envName === 'prod'

    // ── Stack-level tags (Section 13.5) ───────────────────────────────────────
    cdk.Tags.of(this).add('Project', 'duseum')
    cdk.Tags.of(this).add('Environment', envName)
    cdk.Tags.of(this).add('Stack', this.stackName)

    // ── CDK context ───────────────────────────────────────────────────────────
    const certArn       = this.node.tryGetContext(`certArn.${envName}`) as string
    const keyPairId     = this.node.tryGetContext(`cloudfrontKeyPairId.${envName}`) as string

    if (!certArn)   throw new Error(`Missing CDK context: certArn.${envName}`)
    if (!keyPairId) throw new Error(`Missing CDK context: cloudfrontKeyPairId.${envName}`)

    // ── Domain names ──────────────────────────────────────────────────────────
    const appDomain   = isProd ? 'duseum.com'             : `${envName}.duseum.com`
    const wwwDomain   = isProd ? 'www.duseum.com'         : undefined
    const mediaDomain = isProd ? 'media.duseum.com'       : `media.${envName}.duseum.com`

    const appAliases   = wwwDomain ? [appDomain, wwwDomain] : [appDomain]
    const mediaAliases = [mediaDomain]

    // ── Pre-provisioned references ────────────────────────────────────────────

    // ACM cert — NEVER create a new one (Section CLAUDE.md / pre-provisioned infra)
    const certificate = acm.Certificate.fromCertificateArn(this, 'AcmCert', certArn)

    // Route53 hosted zone — NEVER create a new one
    const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: 'duseum.com',
    })

    // =========================================================================
    // WAF WebACL — CLOUDFRONT scope (must be us-east-1 with CF)
    // Section 7.5: managed rules + rate limits
    // =========================================================================

    const cfWaf = new wafv2.CfnWebACL(this, 'CloudFrontWaf', {
      name: `duseum-${envName}-waf-cloudfront`,
      scope: 'CLOUDFRONT',
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName:               `duseum-${envName}-waf-cloudfront`,
        sampledRequestsEnabled:   true,
      },
      rules: [
        {
          name:     'AWSManagedRulesCommonRuleSet',
          priority: 1,
          overrideAction: { none: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName:               'AWSCommonRuleSet',
            sampledRequestsEnabled:   true,
          },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name:       'AWSManagedRulesCommonRuleSet',
            },
          },
        },
        {
          name:     'AWSManagedRulesKnownBadInputs',
          priority: 2,
          overrideAction: { none: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName:               'AWSKnownBadInputsRuleSet',
            sampledRequestsEnabled:   true,
          },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name:       'AWSManagedRulesKnownBadInputsRuleSet',
            },
          },
        },
        {
          name:     'CloudFrontRateLimit',
          priority: 3,
          action:   { block: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName:               'CloudFrontRateLimit',
            sampledRequestsEnabled:   true,
          },
          statement: {
            rateBasedStatement: {
              limit:            1000,
              aggregateKeyType: 'IP',
            },
          },
        },
      ],
    })

    // =========================================================================
    // CloudFront Key Group — references existing key pair (§7.3)
    // Key pair was created outside CDK; ID injected via CDK context.
    // =========================================================================

    const keyGroup = new cloudfront.CfnKeyGroup(this, 'SignedUrlKeyGroup', {
      keyGroupConfig: {
        name:    `duseum-${envName}-cloudfront-keygroup`,
        comment: `Duseum ${envName} signed URL key group`,
        items:   [keyPairId],
      },
    })

    // =========================================================================
    // Origin Access Controls (OAC) — replaces OAI for S3 origins
    // =========================================================================

    const spaOac = new cloudfront.CfnOriginAccessControl(this, 'SpaOac', {
      originAccessControlConfig: {
        name:                          `duseum-${envName}-oac-spa`,
        originAccessControlOriginType: 's3',
        signingBehavior:               'always',
        signingProtocol:               'sigv4',
      },
    })

    const mediaOac = new cloudfront.CfnOriginAccessControl(this, 'MediaOac', {
      originAccessControlConfig: {
        name:                          `duseum-${envName}-oac-media`,
        originAccessControlOriginType: 's3',
        signingBehavior:               'always',
        signingProtocol:               'sigv4',
      },
    })

    // =========================================================================
    // CloudFront distribution — SPA
    // duseum-{env}-cloudfront-app
    // =========================================================================

    const appDistribution = new cloudfront.CfnDistribution(this, 'AppDistribution', {
      distributionConfig: {
        comment:   `duseum-${envName}-cloudfront-app`,
        enabled:   true,
        httpVersion: 'http2and3',
        ipv6Enabled: true,
        aliases:   appAliases,
        viewerCertificate: {
          acmCertificateArn:      certArn,
          sslSupportMethod:       'sni-only',
          minimumProtocolVersion: 'TLSv1.2_2021',
        },
        webAclId: cfWaf.attrArn,
        origins: [
          {
            id:         `duseum-${envName}-s3-spa`,
            domainName: spaBucketDomainName,
            originAccessControlId: spaOac.attrId,
            s3OriginConfig: { originAccessIdentity: '' },
          },
        ],
        defaultCacheBehavior: {
          targetOriginId:       `duseum-${envName}-s3-spa`,
          viewerProtocolPolicy: 'redirect-to-https',
          compress:             true,
          allowedMethods:       ['GET', 'HEAD', 'OPTIONS'],
          cachedMethods:        ['GET', 'HEAD'],
          cachePolicyId:        '658327ea-f89d-4fab-a63d-7e88639e58f6', // CachingOptimized managed
          responseHeadersPolicyId: '67f7725c-6f97-4210-82d7-5512b31e9d03', // SecurityHeaders managed
        },
        // SPA fallback — 403/404 → serve index.html (React Router)
        customErrorResponses: [
          { errorCode: 403, responseCode: 200, responsePagePath: '/index.html' },
          { errorCode: 404, responseCode: 200, responsePagePath: '/index.html' },
        ],
        restrictions: { geoRestriction: { restrictionType: 'none' } },
      },
    })

    // =========================================================================
    // CloudFront distribution — Media
    // duseum-{env}-cloudfront-media
    // default behavior: public (unsigned) for public artwork thumbnails
    // additional behavior private/*: signed URLs via key group (§7.3)
    // =========================================================================

    const mediaDistribution = new cloudfront.CfnDistribution(this, 'MediaDistribution', {
      distributionConfig: {
        comment:     `duseum-${envName}-cloudfront-media`,
        enabled:     true,
        httpVersion: 'http2and3',
        ipv6Enabled: true,
        aliases:     mediaAliases,
        viewerCertificate: {
          acmCertificateArn:      certArn,
          sslSupportMethod:       'sni-only',
          minimumProtocolVersion: 'TLSv1.2_2021',
        },
        webAclId: cfWaf.attrArn,
        origins: [
          {
            id:         `duseum-${envName}-s3-media`,
            domainName: mediaBucketDomainName,
            originAccessControlId: mediaOac.attrId,
            s3OriginConfig: { originAccessIdentity: '' },
          },
        ],
        // Default behavior — public pieces (unsigned)
        defaultCacheBehavior: {
          targetOriginId:       `duseum-${envName}-s3-media`,
          viewerProtocolPolicy: 'redirect-to-https',
          compress:             true,
          allowedMethods:       ['GET', 'HEAD', 'OPTIONS'],
          cachedMethods:        ['GET', 'HEAD'],
          cachePolicyId:        '658327ea-f89d-4fab-a63d-7e88639e58f6', // CachingOptimized
        },
        // private/* path pattern — requires CloudFront signed URL
        cacheBehaviors: [
          {
            pathPattern:          'private/*',
            targetOriginId:       `duseum-${envName}-s3-media`,
            viewerProtocolPolicy: 'https-only',
            compress:             true,
            allowedMethods:       ['GET', 'HEAD', 'OPTIONS'],
            cachedMethods:        ['GET', 'HEAD'],
            cachePolicyId:        '658327ea-f89d-4fab-a63d-7e88639e58f6',
            trustedKeyGroups:     [keyGroup.attrId],
          },
        ],
        restrictions: { geoRestriction: { restrictionType: 'none' } },
      },
    })

    // =========================================================================
    // Route53 — A records aliasing to CloudFront distributions
    // EXISTING hosted zone — NEVER create a new one
    // =========================================================================

    new route53.ARecord(this, 'AppAliasRecord', {
      zone:       hostedZone,
      recordName: appDomain,
      target:     route53.RecordTarget.fromAlias(
        new route53Targets.CloudFrontTarget(
          // L2 CloudFrontTarget expects IDistribution; we cast via fromDistributionAttributes
          cloudfront.Distribution.fromDistributionAttributes(this, 'AppDistL2', {
            distributionId:         appDistribution.attrId,
            domainName:             appDistribution.attrDomainName,
          })
        )
      ),
    })

    if (wwwDomain) {
      new route53.ARecord(this, 'AppWwwAliasRecord', {
        zone:       hostedZone,
        recordName: wwwDomain,
        target:     route53.RecordTarget.fromAlias(
          new route53Targets.CloudFrontTarget(
            cloudfront.Distribution.fromDistributionAttributes(this, 'AppDistL2Www', {
              distributionId: appDistribution.attrId,
              domainName:     appDistribution.attrDomainName,
            })
          )
        ),
      })
    }

    new route53.ARecord(this, 'MediaAliasRecord', {
      zone:       hostedZone,
      recordName: mediaDomain,
      target:     route53.RecordTarget.fromAlias(
        new route53Targets.CloudFrontTarget(
          cloudfront.Distribution.fromDistributionAttributes(this, 'MediaDistL2', {
            distributionId: mediaDistribution.attrId,
            domainName:     mediaDistribution.attrDomainName,
          })
        )
      ),
    })

    // Expose for DuseumStage
    this.appDistributionId         = appDistribution.attrId
    this.appDistributionDomainName = appDistribution.attrDomainName
    this.mediaDistributionId         = mediaDistribution.attrId
    this.mediaDistributionDomainName = mediaDistribution.attrDomainName

    // =========================================================================
    // SSM Outputs — /duseum/{env}/stacks/cdn/*  (Section 5.4)
    // =========================================================================

    const ssmPrefix = `/duseum/${envName}/stacks/cdn`

    new ssm.StringParameter(this, 'SsmAppDistributionId', {
      parameterName: `${ssmPrefix}/app_distribution_id`,
      stringValue:   appDistribution.attrId,
      description:   `[${envName}] CloudFront SPA distribution ID`,
    })

    new ssm.StringParameter(this, 'SsmAppDistributionDomain', {
      parameterName: `${ssmPrefix}/app_distribution_domain`,
      stringValue:   appDistribution.attrDomainName,
      description:   `[${envName}] CloudFront SPA distribution domain`,
    })

    new ssm.StringParameter(this, 'SsmMediaDistributionId', {
      parameterName: `${ssmPrefix}/media_distribution_id`,
      stringValue:   mediaDistribution.attrId,
      description:   `[${envName}] CloudFront media distribution ID`,
    })

    new ssm.StringParameter(this, 'SsmMediaDistributionDomain', {
      parameterName: `${ssmPrefix}/media_distribution_domain`,
      stringValue:   mediaDistribution.attrDomainName,
      description:   `[${envName}] CloudFront media distribution domain`,
    })

    new ssm.StringParameter(this, 'SsmCloudfrontKeyPairId', {
      parameterName: `${ssmPrefix}/cloudfront_key_pair_id`,
      stringValue:   keyPairId,
      description:   `[${envName}] CloudFront key pair ID (for signed URLs)`,
    })

    new ssm.StringParameter(this, 'SsmAcmCertificateArn', {
      parameterName: `${ssmPrefix}/acm_certificate_arn`,
      stringValue:   certArn,
      description:   `[${envName}] ACM certificate ARN`,
    })

    // SPA bucket name — needed by GitHub Actions deploy step to sync built assets
    void spaBucketName
    void mediaBucketName
  }
}
