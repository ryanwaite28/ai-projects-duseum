## Design: Storage Stack (DynamoDB + S3)

**Spec**: `specs/infrastructure/storage-stack.md`
**Status**: 🔒 Implemented
**Approved**: 2026-04-25
**Last updated**: 2026-04-25

---

### TypeScript Interfaces

```typescript
// infrastructure/stacks/storage-stack.ts
export interface StorageStackProps extends cdk.StackProps {
  readonly envName: string
}

export class StorageStack extends cdk.Stack {
  public readonly mediaBucket: s3.Bucket
  public readonly spaBucket: s3.Bucket
  public readonly mainTable: dynamodb.Table
  public readonly idempotencyTable: dynamodb.Table
  public readonly configTable: dynamodb.Table
}
```

### DynamoDB Record Shapes

N/A — StorageStack provisions tables; it does not write application records.

### Function Signatures

N/A — CDK stack; no Lambda functions.

### CDK Construct Patterns

```typescript
// S3 Media Bucket — private, versioned, PUT CORS
this.mediaBucket = new s3.Bucket(this, 'MediaBucket', {
  bucketName: `duseum-${envName}-s3-media`,
  versioned: true,
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  encryption: s3.BucketEncryption.S3_MANAGED,
  enforceSSL: true,
  cors: [{ allowedMethods: [s3.HttpMethods.PUT], allowedOrigins: ['*'], allowedHeaders: ['*'], maxAge: 3_000 }],
  lifecycleRules: [{ abortIncompleteMultipartUploadAfter: cdk.Duration.days(1) }],
  removalPolicy, autoDeleteObjects: !isProd,
})

// S3 SPA Bucket — static website (index.html fallback), CloudFront OAC in CdnStack
this.spaBucket = new s3.Bucket(this, 'SpaBucket', {
  bucketName: `duseum-${envName}-s3-spa`,
  websiteIndexDocument: 'index.html',
  websiteErrorDocument: 'index.html',
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  enforceSSL: true, removalPolicy, autoDeleteObjects: !isProd,
})

// DynamoDB Main Table — single-table design with 6 GSIs
this.mainTable = new dynamodb.Table(this, 'MainTable', {
  tableName: `duseum-${envName}-dynamodb-main`,
  partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
  sortKey:      { name: 'SK', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: isProd },
  removalPolicy,
})
// 6 GSIs added via mainTable.addGlobalSecondaryIndex(...)
```

**GSIs on main table** (actual implementation, diverges from data-model.md):

| GSI | PK attribute | SK attribute | Purpose |
|---|---|---|---|
| `GSI-AuthorPublic` | `authorId` | `visibility#createdAt` | Author's public piece gallery |
| `GSI-AllPublicPieces` | `status` | `createdAt` | Global public piece browse |
| `GSI-FollowersByAuthor` | `authorId` | `followedAt` | Followers of an Author (fan-out) |
| `GSI-SubscribersByAuthor` | `authorId` | `subscribedAt` | Subscribers of an Author |
| `GSI-TagIndex` | `tag` | `createdAt` | Tag-based artwork browse |
| `GSI-WeeklyFeatureByStatus` | `featureStatus` | `isoWeek` | Weekly feature booking queries |

Note: Actual GSI names and attributes differ from data-model.md (which describes `GSI1`, `GSI2`, `GSI3`). The implementation uses descriptive names and domain-specific attribute names.

```typescript
// DynamoDB Idempotency Table — TTL on 'ttl' attribute
this.idempotencyTable = new dynamodb.Table(this, 'IdempotencyTable', {
  tableName: `duseum-${envName}-dynamodb-idempotency`,
  partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  timeToLiveAttribute: 'ttl',
  removalPolicy,
})

// DynamoDB Config Table — no TTL
this.configTable = new dynamodb.Table(this, 'ConfigTable', {
  tableName: `duseum-${envName}-dynamodb-config`,
  partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  removalPolicy,
})

// SSM outputs under /duseum/{env}/stacks/storage/
// media_bucket_name | media_bucket_arn | spa_bucket_name
// dynamodb_main_table_name | dynamodb_idempotency_table_name | dynamodb_config_table_name
```

### Implementation Steps

1. `StorageStack` constructed with `envName` prop.
2. `isProd = envName === 'prod'`; `removalPolicy` = RETAIN for prod, DESTROY for dev.
3. S3 media bucket created: private, versioned, PUT CORS (`allowedOrigins: ['*']` — tightened by CloudFront in prod), lifecycle rule aborts incomplete multipart uploads after 1 day.
4. S3 SPA bucket created: `websiteIndexDocument: 'index.html'`, `websiteErrorDocument: 'index.html'` (SPA routing fallback), CloudFront OAC wired in CdnStack.
5. Main DynamoDB table created on-demand billing; PITR enabled for prod only. 6 GSIs added.
6. Idempotency table created with `timeToLiveAttribute: 'ttl'`.
7. Config table created (no TTL, no sort key — PK-only).
8. 6 SSM parameters written under `/duseum/{env}/stacks/storage/`.
9. Stack-level tags applied: `Project=duseum`, `Environment={env}`, `Stack={stackName}`.

### Integration Test Fixtures

No integration tests found for StorageStack CDK construct. CDK unit tests recommended (`cdk synth --strict` validated in CI).

### Decisions & Constraints

- Idempotency table has no sort key — PK is the Stripe event ID directly (not `PK+SK` pattern). This diverges from data-model.md which shows `PK={eventId}, SK=META`; the actual table is PK-only.
- Config table is PK-only (no sort key) — config items have simple `PK=CONFIG#{key}` access pattern.
- `autoDeleteObjects: !isProd` allows `cdk destroy` to clean up dev buckets; prod buckets are retained.
- Lifecycle rule `abortIncompleteMultipartUploadAfter` targets stalled uploads, not the `upload-intent/` prefix lifecycle described in data-model.md (which would require an S3 lifecycle rule with prefix filter — not implemented in v1).
- `allowedOrigins: ['*']` on S3 CORS is intentionally broad; CloudFront's origin header enforcement provides the actual restriction in production.
