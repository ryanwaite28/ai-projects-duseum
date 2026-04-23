// =============================================================================
// infrastructure/stacks/api-stack.ts
// ApiStack — HTTP API Gateway + all Lambda functions + WAF + SSM outputs
//
// Resources owned by this stack (Section 5.2):
//   - API Gateway v2 HTTP API
//   - Cognito JWT authorizer
//   - WAF WebACL (REGIONAL scope) attached to the API stage
//   - All Lambda functions (Section 4.2)
//   - SQS event source mappings for subscriptions-webhook + notifications
//   - EventBridge targets for maintenance-lambda
//   - SSM params /duseum/{env}/stacks/api/*
//
// Cross-stack wiring via SSM only (Section 13.5 / Rule 15).
// No Fn.importValue(), no CfnOutput cross-stack references.
// =============================================================================

import * as path from 'node:path'
import * as cdk from 'aws-cdk-lib'
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2'
import * as events from 'aws-cdk-lib/aws-events'
import * as targets from 'aws-cdk-lib/aws-events-targets'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources'
import * as sqs from 'aws-cdk-lib/aws-sqs'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import * as wafv2 from 'aws-cdk-lib/aws-wafv2'
import { Construct } from 'constructs'
import { DuseumLambdaFunction } from '../constructs/lambda-function'

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Build a DynamoDB table ARN (+ /index/* variant) from an SSM-resolved table name token. */
const dynamoArns = (scope: cdk.Stack, tableName: string) => ([
  cdk.Fn.sub('arn:aws:dynamodb:${AWS::Region}:${AWS::AccountId}:table/${T}', { T: tableName }),
  cdk.Fn.sub('arn:aws:dynamodb:${AWS::Region}:${AWS::AccountId}:table/${T}/index/*', { T: tableName }),
])

/** Build a Secrets Manager secret ARN wildcard from a secret path. */
const secretArn = (scope: cdk.Stack, envName: string, secretPath: string) =>
  cdk.Fn.sub(
    `arn:aws:secretsmanager:\${AWS::Region}:\${AWS::AccountId}:secret:${secretPath}*`,
    {}
  )

// ── Props ──────────────────────────────────────────────────────────────────────

export interface ApiStackProps extends cdk.StackProps {
  readonly envName: string
}

// ── Stack ──────────────────────────────────────────────────────────────────────

export class ApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props)

    const { envName } = props

    // ── Stack-level tags (Section 13.5) ───────────────────────────────────────
    cdk.Tags.of(this).add('Project', 'duseum')
    cdk.Tags.of(this).add('Environment', envName)
    cdk.Tags.of(this).add('Stack', this.stackName)

    // =========================================================================
    // SSM lookups — cross-stack outputs from infrastructure stacks
    // =========================================================================

    const storagePrefix   = `/duseum/${envName}/stacks/storage`
    const authPrefix      = `/duseum/${envName}/stacks/auth`
    const messagingPrefix = `/duseum/${envName}/stacks/messaging`
    const cdnPrefix       = `/duseum/${envName}/stacks/cdn`

    // Storage
    const mainTableName         = ssm.StringParameter.valueForStringParameter(this, `${storagePrefix}/dynamodb_main_table_name`)
    const idempotencyTableName  = ssm.StringParameter.valueForStringParameter(this, `${storagePrefix}/dynamodb_idempotency_table_name`)
    const configTableName       = ssm.StringParameter.valueForStringParameter(this, `${storagePrefix}/dynamodb_config_table_name`)
    const mediaBucketName       = ssm.StringParameter.valueForStringParameter(this, `${storagePrefix}/media_bucket_name`)
    const mediaBucketArn        = ssm.StringParameter.valueForStringParameter(this, `${storagePrefix}/media_bucket_arn`)

    // Auth
    const userPoolId       = ssm.StringParameter.valueForStringParameter(this, `${authPrefix}/user_pool_id`)
    const userPoolClientId = ssm.StringParameter.valueForStringParameter(this, `${authPrefix}/user_pool_client_id`)
    const userPoolArn      = ssm.StringParameter.valueForStringParameter(this, `${authPrefix}/user_pool_arn`)

    // Messaging
    const notificationQueueUrl  = ssm.StringParameter.valueForStringParameter(this, `${messagingPrefix}/notification_queue_url`)
    const notificationQueueArn  = ssm.StringParameter.valueForStringParameter(this, `${messagingPrefix}/notification_queue_arn`)
    const stripeWebhookQueueUrl = ssm.StringParameter.valueForStringParameter(this, `${messagingPrefix}/stripe_webhook_queue_url`)
    const stripeWebhookQueueArn = ssm.StringParameter.valueForStringParameter(this, `${messagingPrefix}/stripe_webhook_queue_arn`)

    // CDN
    const cloudfrontMediaDomain = ssm.StringParameter.valueForStringParameter(this, `${cdnPrefix}/media_distribution_domain`)
    const cloudfrontKeyPairId   = ssm.StringParameter.valueForStringParameter(this, `${cdnPrefix}/cloudfront_key_pair_id`)

    // ── Common shared env vars for all lambdas ────────────────────────────────
    const commonEnv = {
      DYNAMODB_TABLE_NAME:      mainTableName,
      IDEMPOTENCY_TABLE_NAME:   idempotencyTableName,
      CONFIG_TABLE_NAME:        configTableName,
      S3_MEDIA_BUCKET_NAME:     mediaBucketName,
      CLOUDFRONT_MEDIA_DOMAIN:  cloudfrontMediaDomain,
      CLOUDFRONT_KEY_PAIR_ID:   cloudfrontKeyPairId,
      COGNITO_USER_POOL_ID:     userPoolId,
      COGNITO_CLIENT_ID:        userPoolClientId,
    }

    // ── Common DynamoDB main table CRUD policy ────────────────────────────────
    const mainTableCrudPolicy = new iam.PolicyStatement({
      sid: 'DynamoDbMainTableCrud',
      effect: iam.Effect.ALLOW,
      actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:DeleteItem', 'dynamodb:Query'],
      resources: dynamoArns(this, mainTableName),
    })

    // =========================================================================
    // HTTP API Gateway v2
    // =========================================================================

    const httpApi = new apigatewayv2.CfnApi(this, 'HttpApi', {
      name: `duseum-${envName}-apigw`,
      protocolType: 'HTTP',
      corsConfiguration: {
        allowOrigins: envName === 'prod'
          ? ['https://duseum.com', 'https://www.duseum.com']
          : ['*'],
        allowHeaders: ['Authorization', 'Content-Type', 'Stripe-Signature'],
        allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        maxAge: 86_400,
      },
    })

    const stage = new apigatewayv2.CfnStage(this, 'DefaultStage', {
      apiId: httpApi.ref,
      stageName: '$default',
      autoDeploy: true,
      defaultRouteSettings: {
        throttlingBurstLimit: 500,
        throttlingRateLimit: 1_000,
      },
    })

    const jwtAuthorizer = new apigatewayv2.CfnAuthorizer(this, 'CognitoAuthorizer', {
      apiId: httpApi.ref,
      authorizerType: 'JWT',
      name: `duseum-${envName}-cognito-jwt`,
      identitySource: ['$request.header.Authorization'],
      jwtConfiguration: {
        audience: [userPoolClientId],
        issuer: cdk.Fn.sub(
          'https://cognito-idp.${AWS::Region}.amazonaws.com/${UserPoolId}',
          { UserPoolId: userPoolId }
        ),
      },
    })

    // ── Invoke permission helper ──────────────────────────────────────────────
    const grantApiGwInvoke = (fn: DuseumLambdaFunction, permissionId: string) => {
      fn.fn.addPermission(permissionId, {
        principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
        sourceArn: cdk.Fn.sub(
          'arn:aws:execute-api:${AWS::Region}:${AWS::AccountId}:${ApiId}/*/*',
          { ApiId: httpApi.ref }
        ),
      })
    }

    // ── Integration + routes helper ───────────────────────────────────────────
    const makeIntegration = (id: string, fn: DuseumLambdaFunction) =>
      new apigatewayv2.CfnIntegration(this, id, {
        apiId: httpApi.ref,
        integrationType: 'AWS_PROXY',
        integrationUri: fn.fn.functionArn,
        payloadFormatVersion: '2.0',
      })

    const route = (
      id: string,
      routeKey: string,
      integration: apigatewayv2.CfnIntegration,
      auth: 'JWT' | 'NONE'
    ) =>
      new apigatewayv2.CfnRoute(this, id, {
        apiId: httpApi.ref,
        routeKey,
        authorizationType: auth,
        ...(auth === 'JWT' ? { authorizerId: jwtAuthorizer.ref } : {}),
        target: cdk.Fn.join('/', ['integrations', integration.ref]),
      })

    // =========================================================================
    // WAF WebACL — REGIONAL scope (API Gateway)
    // Section 7.5
    // =========================================================================

    const apiWaf = new wafv2.CfnWebACL(this, 'ApiWaf', {
      name: `duseum-${envName}-waf-api`,
      scope: 'REGIONAL',
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName:               `duseum-${envName}-waf-api`,
        sampledRequestsEnabled:   true,
      },
      rules: [
        {
          name: 'AWSManagedRulesCommonRuleSet',
          priority: 1,
          overrideAction: { none: {} },
          visibilityConfig: { cloudWatchMetricsEnabled: true, metricName: 'CommonRuleSet', sampledRequestsEnabled: true },
          statement: { managedRuleGroupStatement: { vendorName: 'AWS', name: 'AWSManagedRulesCommonRuleSet' } },
        },
        {
          name: 'AWSManagedRulesKnownBadInputs',
          priority: 2,
          overrideAction: { none: {} },
          visibilityConfig: { cloudWatchMetricsEnabled: true, metricName: 'KnownBadInputs', sampledRequestsEnabled: true },
          statement: { managedRuleGroupStatement: { vendorName: 'AWS', name: 'AWSManagedRulesKnownBadInputsRuleSet' } },
        },
        {
          // 1,000 req/5-min per IP for general API routes
          name: 'ApiRateLimit',
          priority: 3,
          action: { block: {} },
          visibilityConfig: { cloudWatchMetricsEnabled: true, metricName: 'ApiRateLimit', sampledRequestsEnabled: true },
          statement: { rateBasedStatement: { limit: 1000, aggregateKeyType: 'IP' } },
        },
        {
          // 30 req/5-min per IP on upload intent endpoint (§7.5 UploadRateLimit)
          name: 'UploadRateLimit',
          priority: 4,
          action: { block: {} },
          visibilityConfig: { cloudWatchMetricsEnabled: true, metricName: 'UploadRateLimit', sampledRequestsEnabled: true },
          statement: {
            rateBasedStatement: {
              limit: 30,
              aggregateKeyType: 'IP',
              scopeDownStatement: {
                byteMatchStatement: {
                  searchString: '/media/upload-intent',
                  fieldToMatch: { uriPath: {} },
                  textTransformations: [{ priority: 0, type: 'NONE' }],
                  positionalConstraint: 'STARTS_WITH',
                },
              },
            },
          },
        },
      ],
    })

    // Associate WAF with API Gateway $default stage
    // HTTP API v2 ARN format uses /apis/ (not /restapis/ which is REST API v1)
    new wafv2.CfnWebACLAssociation(this, 'ApiWafAssociation', {
      resourceArn: cdk.Fn.sub(
        'arn:aws:apigateway:${AWS::Region}::/apis/${ApiId}/stages/$default',
        { ApiId: httpApi.ref }
      ),
      webAclArn: apiWaf.attrArn,
    })

    // =========================================================================
    // media-lambda (Section 4.2, 5.6)
    // IAM: DynamoDB ReadWrite (main) + S3 PutObject
    // =========================================================================

    const mediaLambda = new DuseumLambdaFunction(this, 'media', {
      envName,
      entry: path.resolve(__dirname, '../../lambdas/media/src/index.ts'),
      description: `[${envName}] media-lambda — presigned S3 upload URLs`,
      environment: { ...commonEnv },
      initialPolicy: [
        new iam.PolicyStatement({
          sid: 'MediaDynamo',
          effect: iam.Effect.ALLOW,
          actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem'],
          resources: dynamoArns(this, mainTableName),
        }),
        new iam.PolicyStatement({
          sid: 'MediaS3Put',
          effect: iam.Effect.ALLOW,
          actions: ['s3:PutObject'],
          resources: [`${mediaBucketArn}/*`],
        }),
      ],
    })
    grantApiGwInvoke(mediaLambda, 'MediaApiGwInvoke')
    const mediaIntegration = makeIntegration('MediaIntegration', mediaLambda)
    route('RoutePostUploadIntent', 'POST /media/upload-intent', mediaIntegration, 'JWT')
    stage.node.addDependency(mediaIntegration)

    // =========================================================================
    // artworks-lambda (Section 4.2, 5.6)
    // IAM: DynamoDB CRUD (main + config) + S3 read/delete + SecretsManager (CF key) + SQS send
    // =========================================================================

    const artworksLambda = new DuseumLambdaFunction(this, 'artworks', {
      envName,
      entry: path.resolve(__dirname, '../../lambdas/artworks/src/index.ts'),
      description: `[${envName}] artworks-lambda — artwork CRUD + access control`,
      environment: { ...commonEnv, NOTIFICATION_QUEUE_URL: notificationQueueUrl },
      initialPolicy: [
        mainTableCrudPolicy,
        new iam.PolicyStatement({
          sid: 'ArtworksConfigRead',
          effect: iam.Effect.ALLOW,
          actions: ['dynamodb:GetItem'],
          resources: dynamoArns(this, configTableName),
        }),
        new iam.PolicyStatement({
          sid: 'ArtworksS3',
          effect: iam.Effect.ALLOW,
          actions: ['s3:HeadObject', 's3:GetObject', 's3:DeleteObject'],
          resources: [`${mediaBucketArn}/*`],
        }),
        new iam.PolicyStatement({
          sid: 'ArtworksCFKey',
          effect: iam.Effect.ALLOW,
          actions: ['secretsmanager:GetSecretValue'],
          resources: [secretArn(this, envName, `duseum/${envName}/cloudfront/private-key`)],
        }),
        new iam.PolicyStatement({
          sid: 'ArtworksSqsSend',
          effect: iam.Effect.ALLOW,
          actions: ['sqs:SendMessage'],
          resources: [notificationQueueArn],
        }),
      ],
    })
    grantApiGwInvoke(artworksLambda, 'ArtworksApiGwInvoke')
    const artworksIntegration = makeIntegration('ArtworksIntegration', artworksLambda)
    route('RouteGetArtworks',       'GET /artworks',                  artworksIntegration, 'NONE')
    route('RouteGetArtwork',        'GET /artworks/{artworkId}',      artworksIntegration, 'NONE')
    route('RoutePostArtwork',       'POST /artworks',                 artworksIntegration, 'JWT')
    route('RoutePutArtwork',        'PUT /artworks/{artworkId}',      artworksIntegration, 'JWT')
    route('RouteDeleteArtwork',     'DELETE /artworks/{artworkId}',   artworksIntegration, 'JWT')
    stage.node.addDependency(artworksIntegration)

    // =========================================================================
    // users-lambda (Section 4.2, 5.6)
    // IAM: DynamoDB CRUD (main table) + Cognito AdminGetUser
    // =========================================================================

    const usersLambda = new DuseumLambdaFunction(this, 'users', {
      envName,
      entry: path.resolve(__dirname, '../../lambdas/users/src/index.ts'),
      description: `[${envName}] users-lambda — user profiles, author directory, collections`,
      environment: { ...commonEnv },
      initialPolicy: [
        mainTableCrudPolicy,
        new iam.PolicyStatement({
          sid: 'UsersCognito',
          effect: iam.Effect.ALLOW,
          actions: ['cognito-idp:AdminGetUser'],
          resources: [userPoolArn],
        }),
      ],
    })
    grantApiGwInvoke(usersLambda, 'UsersApiGwInvoke')
    const usersIntegration = makeIntegration('UsersIntegration', usersLambda)
    route('RouteGetMe',               'GET /users/me',                          usersIntegration, 'JWT')
    route('RoutePutMeViewer',         'PUT /users/me/viewer',                   usersIntegration, 'JWT')
    route('RoutePostMeAuthor',        'POST /users/me/author',                  usersIntegration, 'JWT')
    route('RoutePutMeAuthor',         'PUT /users/me/author',                   usersIntegration, 'JWT')
    route('RouteGetUserProfile',      'GET /users/{userId}/profile',            usersIntegration, 'NONE')
    route('RouteGetAuthors',          'GET /authors',                           usersIntegration, 'NONE')
    route('RouteGetAuthor',           'GET /authors/{authorId}',                usersIntegration, 'NONE')
    route('RouteGetAuthorCollections','GET /authors/{authorId}/collections',    usersIntegration, 'NONE')
    stage.node.addDependency(usersIntegration)

    // =========================================================================
    // subscriptions-lambda (Section 4.2, 5.6)
    // IAM: DynamoDB ReadWrite (main) + SecretsManager (Stripe key)
    // =========================================================================

    const subscriptionsLambda = new DuseumLambdaFunction(this, 'subscriptions', {
      envName,
      entry: path.resolve(__dirname, '../../lambdas/subscriptions/src/index.ts'),
      description: `[${envName}] subscriptions-lambda — Stripe checkout + billing portal`,
      environment: { ...commonEnv },
      initialPolicy: [
        mainTableCrudPolicy,
        new iam.PolicyStatement({
          sid: 'SubsStripeKey',
          effect: iam.Effect.ALLOW,
          actions: ['secretsmanager:GetSecretValue'],
          resources: [secretArn(this, envName, `duseum/${envName}/stripe/secret-key`)],
        }),
      ],
    })
    grantApiGwInvoke(subscriptionsLambda, 'SubsApiGwInvoke')
    const subsIntegration = makeIntegration('SubsIntegration', subscriptionsLambda)
    route('RouteGetSubsMe',          'GET /subscriptions/me',                subsIntegration, 'JWT')
    route('RoutePostSubsPlatform',   'POST /subscriptions/platform',         subsIntegration, 'JWT')
    route('RoutePostSubsAuthor',     'POST /subscriptions/authors/{authorId}',subsIntegration, 'JWT')
    route('RoutePostSubsPortal',     'POST /subscriptions/portal',           subsIntegration, 'JWT')
    stage.node.addDependency(subsIntegration)

    // =========================================================================
    // stripe-ingress-lambda — thin webhook validator → SQS enqueue (§4.5)
    // HTTP API v2 does not support direct SQS service integrations; this thin
    // Lambda validates the Stripe-Signature and enqueues to SQS, then returns
    // 200. No business logic — all processing in subscriptions-webhook-lambda.
    // =========================================================================

    const stripeIngressLambda = new DuseumLambdaFunction(this, 'stripe-ingress', {
      envName,
      entry: path.resolve(__dirname, '../../lambdas/subscriptions-webhook/src/ingress.ts'),
      description: `[${envName}] stripe-ingress-lambda — validate Stripe signature, enqueue to SQS`,
      environment: {
        ...commonEnv,
        STRIPE_WEBHOOK_QUEUE_URL: stripeWebhookQueueUrl,
      },
      initialPolicy: [
        new iam.PolicyStatement({
          sid: 'IngressSqsSend',
          effect: iam.Effect.ALLOW,
          actions: ['sqs:SendMessage'],
          resources: [stripeWebhookQueueArn],
        }),
        new iam.PolicyStatement({
          sid: 'IngressStripeSecret',
          effect: iam.Effect.ALLOW,
          actions: ['secretsmanager:GetSecretValue'],
          resources: [secretArn(this, envName, `duseum/${envName}/stripe/webhook-secret`)],
        }),
      ],
    })
    grantApiGwInvoke(stripeIngressLambda, 'IngressApiGwInvoke')
    const ingressIntegration = makeIntegration('IngressIntegration', stripeIngressLambda)
    route('RoutePostWebhookStripe', 'POST /webhooks/stripe', ingressIntegration, 'NONE')
    stage.node.addDependency(ingressIntegration)

    // =========================================================================
    // subscriptions-webhook-lambda — SQS-triggered processor (§4.5)
    // IAM: DynamoDB CRUD (main + idempotency) + SecretsManager (webhook secret)
    //      SQS ReceiveMessage/DeleteMessage on webhook queue
    // =========================================================================

    const stripeWebhookQueue = sqs.Queue.fromQueueArn(
      this, 'ImportedStripeWebhookQueue', stripeWebhookQueueArn
    )

    const subsWebhookLambda = new DuseumLambdaFunction(this, 'subscriptions-webhook', {
      envName,
      entry: path.resolve(__dirname, '../../lambdas/subscriptions-webhook/src/index.ts'),
      description: `[${envName}] subscriptions-webhook-lambda — process Stripe events from SQS`,
      environment: { ...commonEnv },
      initialPolicy: [
        mainTableCrudPolicy,
        new iam.PolicyStatement({
          sid: 'WebhookIdempotency',
          effect: iam.Effect.ALLOW,
          actions: ['dynamodb:GetItem', 'dynamodb:PutItem'],
          resources: dynamoArns(this, idempotencyTableName),
        }),
        new iam.PolicyStatement({
          sid: 'WebhookSecret',
          effect: iam.Effect.ALLOW,
          actions: ['secretsmanager:GetSecretValue'],
          resources: [secretArn(this, envName, `duseum/${envName}/stripe/webhook-secret`)],
        }),
        new iam.PolicyStatement({
          sid: 'WebhookStripeKey',
          effect: iam.Effect.ALLOW,
          actions: ['secretsmanager:GetSecretValue'],
          resources: [secretArn(this, envName, `duseum/${envName}/stripe/secret-key`)],
        }),
      ],
    })
    subsWebhookLambda.fn.addEventSource(
      new lambdaEventSources.SqsEventSource(stripeWebhookQueue, {
        batchSize: 1, // process one Stripe event at a time (idempotency + ordering)
      })
    )

    // =========================================================================
    // notifications-lambda — SQS-triggered fan-out (§4.6)
    // IAM: DynamoDB ReadWrite (main) + SQS receive/delete + SES SendEmail
    // =========================================================================

    const notificationQueue = sqs.Queue.fromQueueArn(
      this, 'ImportedNotificationQueue', notificationQueueArn
    )

    const notificationsLambda = new DuseumLambdaFunction(this, 'notifications', {
      envName,
      entry: path.resolve(__dirname, '../../lambdas/notifications/src/index.ts'),
      description: `[${envName}] notifications-lambda — fan-out new-piece emails via SES`,
      environment: { ...commonEnv },
      initialPolicy: [
        mainTableCrudPolicy,
        new iam.PolicyStatement({
          sid: 'NotifSes',
          effect: iam.Effect.ALLOW,
          actions: ['ses:SendEmail', 'ses:SendRawEmail'],
          resources: ['*'], // SES requires * or verified identity ARN
        }),
        new iam.PolicyStatement({
          sid: 'NotifUnsubSecret',
          effect: iam.Effect.ALLOW,
          actions: ['secretsmanager:GetSecretValue'],
          resources: [secretArn(this, envName, `duseum/${envName}/notifications/unsubscribe-secret`)],
        }),
      ],
    })
    notificationsLambda.fn.addEventSource(
      new lambdaEventSources.SqsEventSource(notificationQueue, {
        batchSize: 1,
      })
    )

    // =========================================================================
    // features-lambda (Section 4.2, 5.6)
    // IAM: DynamoDB ReadWrite (main + config) + SecretsManager (Stripe key)
    // =========================================================================

    const featuresLambda = new DuseumLambdaFunction(this, 'features', {
      envName,
      entry: path.resolve(__dirname, '../../lambdas/features/src/index.ts'),
      description: `[${envName}] features-lambda — daily/weekly featured authors + booking`,
      environment: { ...commonEnv },
      initialPolicy: [
        mainTableCrudPolicy,
        new iam.PolicyStatement({
          sid: 'FeaturesConfig',
          effect: iam.Effect.ALLOW,
          actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:Query'],
          resources: dynamoArns(this, configTableName),
        }),
        new iam.PolicyStatement({
          sid: 'FeaturesStripeKey',
          effect: iam.Effect.ALLOW,
          actions: ['secretsmanager:GetSecretValue'],
          resources: [secretArn(this, envName, `duseum/${envName}/stripe/secret-key`)],
        }),
      ],
    })
    grantApiGwInvoke(featuresLambda, 'FeaturesApiGwInvoke')
    const featuresIntegration = makeIntegration('FeaturesIntegration', featuresLambda)
    route('RouteGetFeaturesDaily',        'GET /features/daily',              featuresIntegration, 'NONE')
    route('RouteGetFeaturesWeekly',       'GET /features/weekly',             featuresIntegration, 'NONE')
    route('RouteGetFeaturesAvailability', 'GET /features/weekly/availability',featuresIntegration, 'NONE')
    route('RoutePostFeaturesBook',        'POST /features/weekly/book',       featuresIntegration, 'JWT')
    stage.node.addDependency(featuresIntegration)

    // =========================================================================
    // social-lambda (Section 4.2, 5.6)
    // IAM: DynamoDB ReadWrite (main)
    // =========================================================================

    const socialLambda = new DuseumLambdaFunction(this, 'social', {
      envName,
      entry: path.resolve(__dirname, '../../lambdas/social/src/index.ts'),
      description: `[${envName}] social-lambda — comments, reactions, follows`,
      environment: { ...commonEnv },
      initialPolicy: [mainTableCrudPolicy],
    })
    grantApiGwInvoke(socialLambda, 'SocialApiGwInvoke')
    const socialIntegration = makeIntegration('SocialIntegration', socialLambda)
    route('RouteGetComments',          'GET /artworks/{artworkId}/comments',  socialIntegration, 'NONE')
    route('RoutePostComment',          'POST /artworks/{artworkId}/comments', socialIntegration, 'JWT')
    route('RouteDeleteComment',        'DELETE /comments/{commentId}',         socialIntegration, 'JWT')
    route('RoutePutReaction',          'PUT /artworks/{artworkId}/reactions',  socialIntegration, 'JWT')
    route('RouteDeleteReaction',       'DELETE /artworks/{artworkId}/reactions',socialIntegration, 'JWT')
    route('RoutePostFollow',           'POST /follows/authors/{authorId}',     socialIntegration, 'JWT')
    route('RouteDeleteFollow',         'DELETE /follows/authors/{authorId}',   socialIntegration, 'JWT')
    route('RouteGetFollows',           'GET /follows/authors',                 socialIntegration, 'JWT')
    route('RouteGetNotifPrefs',        'GET /users/me/notification-preferences', socialIntegration, 'JWT')
    route('RoutePutNotifPrefs',        'PUT /users/me/notification-preferences', socialIntegration, 'JWT')
    route('RouteGetUnsubscribe',       'GET /notifications/unsubscribe',       socialIntegration, 'NONE')
    stage.node.addDependency(socialIntegration)

    // =========================================================================
    // admin-lambda (Section 4.2, 5.6)
    // IAM: DynamoDB ReadWrite (all tables) + Cognito admin actions + all secrets
    // =========================================================================

    const adminLambda = new DuseumLambdaFunction(this, 'admin', {
      envName,
      entry: path.resolve(__dirname, '../../lambdas/admin/src/index.ts'),
      description: `[${envName}] admin-lambda — platform administration (ADMIN group only)`,
      environment: { ...commonEnv },
      initialPolicy: [
        mainTableCrudPolicy,
        new iam.PolicyStatement({
          sid: 'AdminIdempotency',
          effect: iam.Effect.ALLOW,
          actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:DeleteItem', 'dynamodb:Query'],
          resources: dynamoArns(this, idempotencyTableName),
        }),
        new iam.PolicyStatement({
          sid: 'AdminConfig',
          effect: iam.Effect.ALLOW,
          actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:DeleteItem', 'dynamodb:Query'],
          resources: dynamoArns(this, configTableName),
        }),
        new iam.PolicyStatement({
          sid: 'AdminCognito',
          effect: iam.Effect.ALLOW,
          actions: ['cognito-idp:AdminGetUser', 'cognito-idp:AdminDisableUser', 'cognito-idp:AdminEnableUser'],
          resources: [userPoolArn],
        }),
        new iam.PolicyStatement({
          sid: 'AdminSecrets',
          effect: iam.Effect.ALLOW,
          actions: ['secretsmanager:GetSecretValue'],
          resources: [secretArn(this, envName, `duseum/${envName}/`)],
        }),
      ],
    })
    grantApiGwInvoke(adminLambda, 'AdminApiGwInvoke')
    const adminIntegration = makeIntegration('AdminIntegration', adminLambda)
    route('RouteAdminAll', 'ANY /admin/{proxy+}', adminIntegration, 'JWT')
    stage.node.addDependency(adminIntegration)

    // =========================================================================
    // maintenance-lambda — EventBridge-triggered (§4.2, MessagingStack rules)
    // IAM: DynamoDB ReadWrite (all tables) + SES
    // EventBridge targets added here by importing rules from SSM ARNs.
    // =========================================================================

    const maintenanceLambda = new DuseumLambdaFunction(this, 'maintenance', {
      envName,
      entry: path.resolve(__dirname, '../../lambdas/maintenance/src/index.ts'),
      description: `[${envName}] maintenance-lambda — daily feature selection + weekly rotation`,
      timeout: cdk.Duration.seconds(300), // up to 5 min for maintenance tasks
      environment: { ...commonEnv },
      initialPolicy: [
        mainTableCrudPolicy,
        new iam.PolicyStatement({
          sid: 'MaintenanceIdempotency',
          effect: iam.Effect.ALLOW,
          actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:Query'],
          resources: dynamoArns(this, idempotencyTableName),
        }),
        new iam.PolicyStatement({
          sid: 'MaintenanceConfig',
          effect: iam.Effect.ALLOW,
          actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:Query'],
          resources: dynamoArns(this, configTableName),
        }),
      ],
    })

    // EventBridge rules target maintenance-lambda directly in ApiStack.
    // MessagingStack exports rule ARNs to SSM for reference, but CDK's
    // fromEventRuleArn() returns IRule which doesn't support addTarget() —
    // rules that target a Lambda must be defined in the same stack as the Lambda.
    new events.Rule(this, 'DailyFeatureRule', {
      ruleName:    `duseum-${envName}-eventbridge-daily-featured-author`,
      description: 'Triggers maintenance-lambda daily to select the featured author',
      schedule:    events.Schedule.cron({ minute: '0', hour: '0' }),
      targets:     [new targets.LambdaFunction(maintenanceLambda.fn)],
    })

    new events.Rule(this, 'WeeklyRotationRule', {
      ruleName:    `duseum-${envName}-eventbridge-weekly-feature-rotation`,
      description: 'Triggers maintenance-lambda every Monday to rotate weekly features',
      schedule:    events.Schedule.cron({ minute: '0', hour: '0', weekDay: 'MON' }),
      targets:     [new targets.LambdaFunction(maintenanceLambda.fn)],
    })

    // =========================================================================
    // SSM Outputs — /duseum/{env}/stacks/api/*  (Section 5.4)
    // =========================================================================

    const ssmPrefix = `/duseum/${envName}/stacks/api`

    new ssm.StringParameter(this, 'SsmApiGatewayUrl', {
      parameterName: `${ssmPrefix}/api_gateway_url`,
      stringValue: cdk.Fn.sub('https://${ApiId}.execute-api.${AWS::Region}.amazonaws.com', { ApiId: httpApi.ref }),
      description: `[${envName}] HTTP API Gateway invoke URL`,
    })

    new ssm.StringParameter(this, 'SsmApiGatewayId', {
      parameterName: `${ssmPrefix}/api_gateway_id`,
      stringValue: httpApi.ref,
      description: `[${envName}] HTTP API Gateway ID`,
    })

    const lambdaOutputs: [string, string, DuseumLambdaFunction][] = [
      ['SsmMediaLambdaArn',            'media_lambda_arn',             mediaLambda],
      ['SsmArtworksLambdaArn',         'artworks_lambda_arn',          artworksLambda],
      ['SsmUsersLambdaArn',            'users_lambda_arn',             usersLambda],
      ['SsmSubscriptionsLambdaArn',    'subscriptions_lambda_arn',     subscriptionsLambda],
      ['SsmWebhookLambdaArn',          'webhook_lambda_arn',           subsWebhookLambda],
      ['SsmNotificationsLambdaArn',    'notifications_lambda_arn',     notificationsLambda],
      ['SsmFeaturesLambdaArn',         'features_lambda_arn',          featuresLambda],
      ['SsmSocialLambdaArn',           'social_lambda_arn',            socialLambda],
      ['SsmAdminLambdaArn',            'admin_lambda_arn',             adminLambda],
      ['SsmMaintenanceLambdaArn',      'maintenance_lambda_arn',       maintenanceLambda],
    ]

    for (const [ssmId, key, lambda] of lambdaOutputs) {
      new ssm.StringParameter(this, ssmId, {
        parameterName: `${ssmPrefix}/${key}`,
        stringValue:   lambda.fn.functionArn,
        description:   `[${envName}] ${key}`,
      })
    }

    // Suppress CDK nag for userPoolArn lookup (used only for authorizer SSM read)
    void userPoolArn
  }
}
