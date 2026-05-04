// =============================================================================
// infrastructure/stacks/storage-stack.ts
// StorageStack — S3 + DynamoDB + SSM outputs
//
// Resources owned by this stack (Section 5.2):
//   - S3 media bucket      duseum-{env}-s3-media
//   - S3 SPA bucket        duseum-{env}-s3-spa
//   - DynamoDB main table  duseum-{env}-dynamodb-main  (+ 6 GSIs per §4.7)
//   - DynamoDB idempotency duseum-{env}-dynamodb-idempotency
//   - DynamoDB config      duseum-{env}-dynamodb-config
//   - SSM params           /duseum/{env}/stacks/storage/*
// =============================================================================

import * as cdk from 'aws-cdk-lib'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import { Construct } from 'constructs'

// ── Props ──────────────────────────────────────────────────────────────────────

export interface StorageStackProps extends cdk.StackProps {
  readonly envName: string
}

// ── Stack ──────────────────────────────────────────────────────────────────────

export class StorageStack extends cdk.Stack {
  // Expose resources so DuseumStage can pass references to dependent stacks
  public readonly mediaBucket: s3.Bucket
  public readonly spaBucket: s3.Bucket
  public readonly mainTable: dynamodb.Table
  public readonly idempotencyTable: dynamodb.Table
  public readonly configTable: dynamodb.Table

  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props)

    const { envName } = props
    const isProd = envName === 'prod'
    const removalPolicy = isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY

    // ── Stack-level tags (Section 13.5) ───────────────────────────────────────
    cdk.Tags.of(this).add('Project', 'duseum')
    cdk.Tags.of(this).add('Environment', envName)
    cdk.Tags.of(this).add('Stack', this.stackName)

    // =========================================================================
    // S3 — Media Bucket (private, versioned, presigned-PUT CORS)
    // =========================================================================

    this.mediaBucket = new s3.Bucket(this, 'MediaBucket', {
      bucketName: `duseum-${envName}-s3-media`,
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,

      // CORS: allow presigned PUT uploads from the SPA
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT],
          allowedOrigins: ['*'],    // tightened in prod via CloudFront policy
          allowedHeaders: ['*'],
          maxAge: 3_000,
        },
      ],

      // Lifecycle: clean up stalled multipart uploads within 1 day
      lifecycleRules: [
        {
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
        },
      ],

      removalPolicy,
      autoDeleteObjects: !isProd,
    })

    // =========================================================================
    // S3 — Media Bucket: CloudFront OAC allow
    // AWS:SourceAccount scopes access to this account's CF distributions only.
    // Specific distribution ARN is unknown here (CdnStack deploys after).
    // =========================================================================

    this.mediaBucket.addToResourcePolicy(new iam.PolicyStatement({
      sid:        'AllowCloudFrontOACMedia',
      effect:     iam.Effect.ALLOW,
      principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
      actions:    ['s3:GetObject'],
      resources:  [this.mediaBucket.arnForObjects('*')],
      conditions: { StringEquals: { 'AWS:SourceAccount': this.account } },
    }))

    // =========================================================================
    // S3 — SPA Bucket (static website hosting; CloudFront OAC in CdnStack)
    // =========================================================================

    this.spaBucket = new s3.Bucket(this, 'SpaBucket', {
      bucketName: `duseum-${envName}-s3-spa`,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html', // SPA — all 404s served index.html
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy,
      autoDeleteObjects: !isProd,
    })

    // CloudFront OAC allow (same account scope — see media bucket comment above)
    this.spaBucket.addToResourcePolicy(new iam.PolicyStatement({
      sid:        'AllowCloudFrontOACSpa',
      effect:     iam.Effect.ALLOW,
      principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
      actions:    ['s3:GetObject'],
      resources:  [this.spaBucket.arnForObjects('*')],
      conditions: { StringEquals: { 'AWS:SourceAccount': this.account } },
    }))

    // =========================================================================
    // DynamoDB — Main Table  (single-table design, §4.7)
    // =========================================================================

    this.mainTable = new dynamodb.Table(this, 'MainTable', {
      tableName: `duseum-${envName}-dynamodb-main`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey:      { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode:  dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: isProd }, // PITR prod-only
      removalPolicy,
    })

    // ── GSI-AuthorDirectory ───────────────────────────────────────────────────
    // Paginated author directory — profileType = 'AUTHOR', sorted by createdAt (FR-DISC-04)
    this.mainTable.addGlobalSecondaryIndex({
      indexName: 'GSI-AuthorDirectory',
      partitionKey: { name: 'profileType', type: dynamodb.AttributeType.STRING },
      sortKey:      { name: 'createdAt',   type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    })

    // ── GSI-AuthorPublic ──────────────────────────────────────────────────────
    // Browse an Author's public pieces in chronological order
    this.mainTable.addGlobalSecondaryIndex({
      indexName: 'GSI-AuthorPublic',
      partitionKey: { name: 'authorId',           type: dynamodb.AttributeType.STRING },
      sortKey:      { name: 'visibility#createdAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    })

    // ── GSI-AllPublicPieces ───────────────────────────────────────────────────
    // Global browse / homepage feed (status = 'PUBLIC')
    this.mainTable.addGlobalSecondaryIndex({
      indexName: 'GSI-AllPublicPieces',
      partitionKey: { name: 'status',    type: dynamodb.AttributeType.STRING },
      sortKey:      { name: 'createdAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    })

    // ── GSI-FollowersByAuthor ─────────────────────────────────────────────────
    // Count / list followers of an Author (Follow items)
    this.mainTable.addGlobalSecondaryIndex({
      indexName: 'GSI-FollowersByAuthor',
      partitionKey: { name: 'authorId',  type: dynamodb.AttributeType.STRING },
      sortKey:      { name: 'followedAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    })

    // ── GSI-SubscribersByAuthor ───────────────────────────────────────────────
    // Count / list Author subscribers (AuthorSubscription items)
    this.mainTable.addGlobalSecondaryIndex({
      indexName: 'GSI-SubscribersByAuthor',
      partitionKey: { name: 'authorId',    type: dynamodb.AttributeType.STRING },
      sortKey:      { name: 'subscribedAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    })

    // ── GSI-TagIndex ──────────────────────────────────────────────────────────
    // Browse artwork by tag
    this.mainTable.addGlobalSecondaryIndex({
      indexName: 'GSI-TagIndex',
      partitionKey: { name: 'tag',       type: dynamodb.AttributeType.STRING },
      sortKey:      { name: 'createdAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    })

    // ── GSI-WeeklyFeatureByStatus ─────────────────────────────────────────────
    // Query confirmed/active bookings for a given week
    this.mainTable.addGlobalSecondaryIndex({
      indexName: 'GSI-WeeklyFeatureByStatus',
      partitionKey: { name: 'featureStatus', type: dynamodb.AttributeType.STRING },
      sortKey:      { name: 'isoWeek',        type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    })

    // ── GSI-AllFreeCollections ────────────────────────────────────────────────
    // Browse all FREE collections globally (FR-DISC-06/07)
    // Only FREE collection METADATA items carry collectionBrowse='FREE' (sparse)
    this.mainTable.addGlobalSecondaryIndex({
      indexName:    'GSI-AllFreeCollections',
      partitionKey: { name: 'collectionBrowse', type: dynamodb.AttributeType.STRING },
      sortKey:      { name: 'createdAt',         type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    })

    // =========================================================================
    // DynamoDB — Idempotency Table (Stripe event deduplication)
    // =========================================================================

    this.idempotencyTable = new dynamodb.Table(this, 'IdempotencyTable', {
      tableName: `duseum-${envName}-dynamodb-idempotency`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',   // §4.7: TTL attribute name is 'ttl'
      removalPolicy,
    })

    // =========================================================================
    // DynamoDB — Config Table (platform-configurable settings)
    // =========================================================================

    this.configTable = new dynamodb.Table(this, 'ConfigTable', {
      tableName: `duseum-${envName}-dynamodb-config`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
    })

    // =========================================================================
    // SSM Outputs — /duseum/{env}/stacks/storage/*  (Section 5.4)
    // =========================================================================

    const ssmPrefix = `/duseum/${envName}/stacks/storage`

    new ssm.StringParameter(this, 'SsmMediaBucketName', {
      parameterName: `${ssmPrefix}/media_bucket_name`,
      stringValue: this.mediaBucket.bucketName,
      description: `[${envName}] duseum-${envName}-s3-media bucket name`,
    })

    new ssm.StringParameter(this, 'SsmMediaBucketArn', {
      parameterName: `${ssmPrefix}/media_bucket_arn`,
      stringValue: this.mediaBucket.bucketArn,
      description: `[${envName}] duseum-${envName}-s3-media bucket ARN`,
    })

    new ssm.StringParameter(this, 'SsmSpaBucketName', {
      parameterName: `${ssmPrefix}/spa_bucket_name`,
      stringValue: this.spaBucket.bucketName,
      description: `[${envName}] duseum-${envName}-s3-spa bucket name`,
    })

    new ssm.StringParameter(this, 'SsmMainTableName', {
      parameterName: `${ssmPrefix}/dynamodb_main_table_name`,
      stringValue: this.mainTable.tableName,
      description: `[${envName}] DynamoDB main table name`,
    })

    new ssm.StringParameter(this, 'SsmIdempotencyTableName', {
      parameterName: `${ssmPrefix}/dynamodb_idempotency_table_name`,
      stringValue: this.idempotencyTable.tableName,
      description: `[${envName}] DynamoDB idempotency table name`,
    })

    new ssm.StringParameter(this, 'SsmConfigTableName', {
      parameterName: `${ssmPrefix}/dynamodb_config_table_name`,
      stringValue: this.configTable.tableName,
      description: `[${envName}] DynamoDB config table name`,
    })
  }
}
