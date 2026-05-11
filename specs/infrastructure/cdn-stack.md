## Spec: CDN Stack (CloudFront + Route53)

**Status**: ✅ Implemented
**FR coverage**: NFR-PERF-02, NFR-SEC-04, NFR-SEC-07, NFR-SEC-06
**Relevant PROJECT.md sections**: 4.4, 5, 13.5

**What this implements**: CDK CdnStack provisioning CloudFront distributions for SPA, API proxy, and media; Route53 records pointing to CloudFront; CloudFront signed URL key pair reference. WAF intentionally disabled (cost optimisation — see NFR-SEC-06).

**Prerequisites**: `api-stack.md` and `storage-stack.md` deployed; ACM certificate ARN available (pre-provisioned in `us-east-1`); Route53 hosted zone for `duseum.com` exists (pre-provisioned)

**Done when**:
- [x] `cdk synth --strict --context env=dev` passes with zero warnings
- [x] OAC (not OAI) configured on S3 origins for SPA and media distributions
- [x] ACM certificate referenced via `Certificate.fromCertificateArn()` — not created in CDK
- [x] Route53 zone referenced via `HostedZone.fromLookup()` — not created in CDK
- [x] Route53 `A` alias records for `app.{env}`, `api.{env}`, `media.{env}` → CloudFront distributions
- [x] WAF intentionally removed (cost optimisation); no `CfnWebACL` attached to either distribution
- [x] 4 SSM outputs written under `/duseum/{env}/stacks/cdn/`
- [x] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `infrastructure/stacks/cdn-stack.ts` — CloudFront distributions, WAF, Route53 records

**CloudFront distributions**:
| Distribution | Origin | Domain | Behaviors |
|---|---|---|---|
| SPA | S3 SPA bucket (OAC) | `app.{env}.duseum.com` | All paths → S3; index.html fallback for SPA routing |
| API | API Gateway | `api.{env}.duseum.com` | All paths → API GW; no caching |
| Media | S3 media bucket (OAC) | `media.{env}.duseum.com` | CloudFront signed URLs required; cache 24hr for public pieces; 1hr for private |

**WAF**: Intentionally disabled for cost optimisation (~$8–10/month saved). No `CfnWebACL` is created or attached. Active CloudFront-layer protections: HTTPS redirect, TLS 1.2 minimum, SecurityHeaders response policy (SPA distribution). See NFR-SEC-06 and PROJECT.md Section 7.5.

**Route53**:
- Use `HostedZone.fromLookup()` for `duseum.com` zone (pre-provisioned, do NOT recreate)
- A records (aliases): `app.{env}`, `api.{env}`, `media.{env}` → respective CloudFront distributions

**ACM Certificate**:
- Use `Certificate.fromCertificateArn()` (pre-provisioned in us-east-1 — do NOT recreate)
- ARN from SSM context or CDK context variable

**CloudFront key pair**:
- `CLOUDFRONT_KEY_PAIR_ID` from SSM (pre-provisioned key pair; private key in Secrets Manager)
- Lambda uses private key from Secrets Manager to sign URLs at request time

**SSM outputs** (`/duseum/{env}/stacks/cdn/`):
- `cloudfront_spa_domain`
- `cloudfront_api_domain`
- `cloudfront_media_domain`
- `cloudfront_media_distribution_id`

**Tests to write**:
- CDK unit: OAC configured on S3 origins (not OAI); no `webAclId` on either distribution; ACM cert referenced (not created)
