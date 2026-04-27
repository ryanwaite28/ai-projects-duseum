## Design: CDN Stack (CloudFront + WAF + Route53)

**Spec**: `specs/infrastructure/cdn-stack.md`
**Status**: 🔒 Implemented
**Approved**: 2026-04-25
**Last updated**: 2026-04-25

---

### TypeScript Interfaces

```typescript
// infrastructure/stacks/cdn-stack.ts
export interface CdnStackProps extends cdk.StackProps {
  readonly envName: string
  readonly spaBucketName: string
  readonly spaBucketDomainName: string
  readonly mediaBucketName: string
  readonly mediaBucketDomainName: string
}

export class CdnStack extends cdk.Stack {
  public readonly appDistributionId: string
  public readonly appDistributionDomainName: string
  public readonly mediaDistributionId: string
  public readonly mediaDistributionDomainName: string
  constructor(scope: Construct, id: string, props: CdnStackProps)
}
```

### DynamoDB Record Shapes

N/A — CdnStack provisions CloudFront, WAF, and Route53 resources; no DynamoDB records.

### Function Signatures

N/A — CDK stack.

### CDK Construct Patterns

```typescript
// ACM + Route53 — pre-provisioned, NEVER re-created
const certificate = acm.Certificate.fromCertificateArn(this, 'AcmCert', certArn)
const hostedZone  = route53.HostedZone.fromLookup(this, 'HostedZone', { domainName: 'duseum.com' })

// CDK context — certArn and keyPairId injected at synth time
const certArn   = this.node.tryGetContext(`certArn.${envName}`) as string
const keyPairId = this.node.tryGetContext(`cloudfrontKeyPairId.${envName}`) as string

// Domain names
// dev:  app → dev.duseum.com, media → media.dev.duseum.com
// prod: app → duseum.com + www.duseum.com, media → media.duseum.com

// WAF WebACL — CLOUDFRONT scope (must be us-east-1)
// Rules: AWSManagedRulesCommonRuleSet (p1), AWSManagedRulesKnownBadInputs (p2),
//        CloudFrontRateLimit 1000 req/5min IP-based block (p3)
const cfWaf = new wafv2.CfnWebACL(this, 'CloudFrontWaf', {
  name: `duseum-${envName}-waf-cloudfront`,
  scope: 'CLOUDFRONT',
  defaultAction: { allow: {} },
  ...
})

// CloudFront KeyGroup — references pre-existing key pair from CDK context
const keyGroup = new cloudfront.CfnKeyGroup(this, 'SignedUrlKeyGroup', {
  keyGroupConfig: {
    name:  `duseum-${envName}-cloudfront-keygroup`,
    items: [keyPairId],
  },
})

// Origin Access Controls (OAC — replaces OAI for S3)
const spaOac   = new cloudfront.CfnOriginAccessControl(this, 'SpaOac', { ... signingBehavior: 'always', signingProtocol: 'sigv4' })
const mediaOac = new cloudfront.CfnOriginAccessControl(this, 'MediaOac', { ... })

// SPA distribution — duseum-{env}-cloudfront-app
// - CachingOptimized managed policy (658327ea-f89d-4fab-a63d-7e88639e58f6)
// - SecurityHeaders managed response policy (67f7725c-6f97-4210-82d7-5512b31e9d03)
// - SPA fallback: 403 → 200 /index.html, 404 → 200 /index.html
// - http2and3, ipv6, TLSv1.2_2021, SNI
const appDistribution = new cloudfront.CfnDistribution(this, 'AppDistribution', { ... })

// Media distribution — duseum-{env}-cloudfront-media
// - Default behavior: public (unsigned), CachingOptimized
// - Additional behavior 'private/*': trustedKeyGroups: [keyGroup.attrId], https-only
const mediaDistribution = new cloudfront.CfnDistribution(this, 'MediaDistribution', { ... })

// Route53 A records aliasing to CloudFront (L1→L2 cast via fromDistributionAttributes)
new route53.ARecord(this, 'AppAliasRecord', { zone: hostedZone, recordName: appDomain, target: route53.RecordTarget.fromAlias(new route53Targets.CloudFrontTarget(...)) })
// prod only: www.duseum.com A record
new route53.ARecord(this, 'MediaAliasRecord', { zone: hostedZone, recordName: mediaDomain, ... })

// SSM outputs under /duseum/{env}/stacks/cdn/
// app_distribution_id | app_distribution_domain
// media_distribution_id | media_distribution_domain
// cloudfront_key_pair_id | acm_certificate_arn
```

**L1 constructs rationale**: CDK L2 `Distribution` lacks native OAC + `trustedKeyGroups` support as of CDK v2. All CloudFront resources use L1 (`CfnDistribution`, `CfnOriginAccessControl`, `CfnKeyGroup`). Route53 A records use L2 via `Distribution.fromDistributionAttributes()` cast.

### Implementation Steps

1. `CdnStack` instantiated with `envName` + S3 bucket names/domain names from `DuseumStage` (S3 values read from StorageStack SSM).
2. Stack-level tags applied.
3. CDK context keys `certArn.{env}` and `cloudfrontKeyPairId.{env}` validated at synth time; stack fails fast if missing.
4. Domain names computed: dev uses `{env}.duseum.com` / `media.{env}.duseum.com`; prod uses apex + www + `media.duseum.com`.
5. Pre-provisioned ACM cert referenced via `Certificate.fromCertificateArn()`; pre-provisioned hosted zone referenced via `HostedZone.fromLookup()`.
6. WAF WebACL created with `CLOUDFRONT` scope (must be us-east-1). Rules: `AWSManagedRulesCommonRuleSet` (p1), `AWSManagedRulesKnownBadInputsRuleSet` (p2), IP rate-limit block at 1000 req/5min (p3).
7. `CfnKeyGroup` created referencing the pre-existing CloudFront key pair ID from context.
8. Two OAC constructs created (`spaOac`, `mediaOac`) — `signingBehavior: 'always'`, `signingProtocol: 'sigv4'`.
9. SPA distribution created: OAC-backed S3 origin, default behavior with CachingOptimized + SecurityHeaders managed policies, SPA 403/404 → 200 `/index.html` custom error responses, WAF attached.
10. Media distribution created: OAC-backed S3 origin, default behavior public (unsigned), `private/*` path-pattern behavior with `trustedKeyGroups: [keyGroup.attrId]` enforcing signed URLs.
11. Route53 A records created aliasing to both distributions. Prod adds a second A record for `www.duseum.com`.
12. 6 SSM parameters written under `/duseum/{env}/stacks/cdn/`.

### Integration Test Fixtures

No integration tests for CdnStack CDK construct. `cdk synth --strict --context env=dev` validated in CI pipeline (both `cdk-synth-dev` and `cdk-synth-prod` jobs).

### Decisions & Constraints

- All CloudFront constructs use L1 (`CfnDistribution`, `CfnOriginAccessControl`, `CfnKeyGroup`) — CDK L2 `Distribution` does not natively support OAC origin association or `trustedKeyGroups` on cache behaviors without L1 escape hatches, so L1 was chosen for clarity.
- OAC replaces OAI — OAC is the current AWS best practice for CloudFront → S3 private access; OAI is legacy.
- `private/*` path pattern on media distribution — S3 objects for PRIVATE artwork are stored under `private/` prefix; the path-pattern behavior enforces signed URL verification at CloudFront before the request ever reaches S3.
- Default media behavior is unsigned — public artwork thumbnails and images do not require signed URLs; enforcing signatures on all media would impose unnecessary overhead.
- ACM cert and CloudFront key pair are pre-provisioned (not created in CDK) — both require domain validation and manual key rotation steps that are outside CDK's lifecycle. They are referenced from CDK context.
- Route53 hosted zone uses `fromLookup()` — zone already exists; creating a new one would break DNS.
- WAF scope is `CLOUDFRONT` (not `REGIONAL`) — CloudFront distributions require a CLOUDFRONT-scoped WebACL; this is separate from the REGIONAL WebACL on API Gateway (in ApiStack).
- `certArn` is used for both SPA and media distributions — a single wildcard or multi-domain ACM cert covers all subdomains.
- Prod SPA distribution includes `www.duseum.com` alias — the conditional `wwwDomain` adds a second A record; dev has no www alias.
- `APP_BASE_URL` not relevant to CDN stack — CDN handles static asset delivery only; application URLs are handled by Lambda route handlers.
- `spaBucketName` and `mediaBucketName` are accepted as props but used only indirectly (via domain name props); they are passed `void` to silence unused-variable lint warnings — they exist on the interface for documentation/DuseumStage wiring clarity.
