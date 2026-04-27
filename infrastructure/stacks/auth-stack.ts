// =============================================================================
// infrastructure/stacks/auth-stack.ts
// AuthStack — Cognito User Pool, SPA App Client, auth-triggers Lambda, SSM
//
// Resources owned by this stack (Section 5.2):
//   - Cognito User Pool       duseum-{env}-cognito-userpool
//   - Cognito App Client      duseum-{env}-cognito-client  (no secret — SPA)
//   - Lambda                  duseum-{env}-lambda-auth-triggers
//   - Post-Confirmation trigger (Lambda → User Pool)
//   - SSM params              /duseum/{env}/stacks/auth/*
//
// Google OAuth IdP: TODO — wired in a future prompt when OAuth client
//   credentials are stored in Secrets Manager.
// =============================================================================

import * as cdk from 'aws-cdk-lib'
import * as cognito from 'aws-cdk-lib/aws-cognito'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import { Construct } from 'constructs'
import { DuseumLambdaFunction } from '../constructs/lambda-function'

// ── Props ──────────────────────────────────────────────────────────────────────

export interface AuthStackProps extends cdk.StackProps {
  readonly envName: string
}

// ── Stack ──────────────────────────────────────────────────────────────────────

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool
  public readonly userPoolClient: cognito.UserPoolClient

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props)

    const { envName } = props

    // ── Stack-level tags (Section 13.5) ───────────────────────────────────────
    cdk.Tags.of(this).add('Project', 'duseum')
    cdk.Tags.of(this).add('Environment', envName)
    cdk.Tags.of(this).add('Stack', this.stackName)

    // =========================================================================
    // Cognito User Pool
    // =========================================================================

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `duseum-${envName}-cognito-userpool`,

      // ── Sign-in ────────────────────────────────────────────────────────────
      signInAliases: { email: true },
      signInCaseSensitive: false,

      // ── Self-service registration ──────────────────────────────────────────
      selfSignUpEnabled: true,
      autoVerify: { email: true },
      userVerification: {
        emailSubject: 'Verify your Duseum account',
        emailBody: 'Your verification code is {####}.',
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },

      // ── Password policy ────────────────────────────────────────────────────
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: cdk.Duration.days(7),
      },

      // ── MFA: optional TOTP (no SMS) ────────────────────────────────────────
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: { otp: true, sms: false },  // otp = TOTP authenticator app

      // ── Standard attributes ────────────────────────────────────────────────
      standardAttributes: {
        email: { required: true, mutable: false },
      },

      // ── Account recovery ───────────────────────────────────────────────────
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,

      // ── Deletion protection ────────────────────────────────────────────────
      deletionProtection: envName === 'prod',
      removalPolicy: envName === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    })

    // TODO: Google OAuth IdP — wired in a future prompt once OAuth client
    // credentials are available in Secrets Manager at:
    //   duseum/{env}/google/oauth-client-id
    //   duseum/{env}/google/oauth-client-secret

    // =========================================================================
    // App Client (SPA — no client secret)
    // =========================================================================

    const appDomain = envName === 'prod' ? 'https://duseum.com' : `https://${envName}.duseum.com`

    this.userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      userPoolClientName: `duseum-${envName}-cognito-client`,

      generateSecret: false,    // SPA — secret never safe in browser code

      // ── Auth flows ─────────────────────────────────────────────────────────
      authFlows: {
        userSrp: true,          // Secure Remote Password — primary flow
        userPassword: false,
        adminUserPassword: false,
        custom: false,
      },

      // ── OAuth / Hosted UI ──────────────────────────────────────────────────
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: false,
        },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: [appDomain + '/callback', 'http://localhost:5173/callback'],
        logoutUrls:   [appDomain,               'http://localhost:5173'],
      },

      // ── Token lifetimes ────────────────────────────────────────────────────
      accessTokenValidity:  cdk.Duration.hours(1),
      idTokenValidity:      cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),

      preventUserExistenceErrors: true,
    })

    // =========================================================================
    // auth-triggers Lambda (Post-Confirmation trigger)
    // §5.6: PutItem on main table only
    // =========================================================================

    // Read the main table name from SSM — written by StorageStack at deploy time.
    // Using valueForStringParameter() resolves at deploy time (not synth time),
    // so this avoids CDK cross-stack CloudFormation references (§13.5 rule).
    const mainTableName = ssm.StringParameter.valueForStringParameter(
      this,
      `/duseum/${envName}/stacks/storage/dynamodb_main_table_name`
    )

    // Construct an ITable reference so we can call grantWriteData() for IAM
    const mainTableRef = dynamodb.Table.fromTableName(
      this,
      'MainTableRef',
      mainTableName
    )

    const triggerFn = new DuseumLambdaFunction(this, 'auth-triggers', {
      envName,
      description: 'Cognito Post-Confirmation: auto-creates UserAccount + ViewerProfile',
      environment: {
        DYNAMODB_TABLE_NAME: mainTableName,
      },
    })

    // Grant least-privilege DynamoDB write access (§5.6: PutItem on main table)
    mainTableRef.grantWriteData(triggerFn.fn)

    // Wire as Cognito Post-Confirmation trigger
    this.userPool.addTrigger(
      cognito.UserPoolOperation.POST_CONFIRMATION,
      triggerFn.fn
    )

    // =========================================================================
    // SSM Outputs — /duseum/{env}/stacks/auth/*  (Section 5.4)
    // =========================================================================

    const ssmPrefix = `/duseum/${envName}/stacks/auth`

    new ssm.StringParameter(this, 'SsmUserPoolId', {
      parameterName: `${ssmPrefix}/user_pool_id`,
      stringValue: this.userPool.userPoolId,
      description: `[${envName}] Cognito User Pool ID`,
    })

    new ssm.StringParameter(this, 'SsmUserPoolClientId', {
      parameterName: `${ssmPrefix}/user_pool_client_id`,
      stringValue: this.userPoolClient.userPoolClientId,
      description: `[${envName}] Cognito App Client ID`,
    })

    new ssm.StringParameter(this, 'SsmUserPoolArn', {
      parameterName: `${ssmPrefix}/user_pool_arn`,
      stringValue: this.userPool.userPoolArn,
      description: `[${envName}] Cognito User Pool ARN`,
    })

    new ssm.StringParameter(this, 'SsmPostConfirmLambdaArn', {
      parameterName: `${ssmPrefix}/post_confirm_lambda_arn`,
      stringValue: triggerFn.fn.functionArn,
      description: `[${envName}] Post-Confirmation Lambda ARN`,
    })
  }
}
