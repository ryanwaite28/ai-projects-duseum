## Design: Auth Stack (Cognito)

**Spec**: `specs/infrastructure/auth-stack.md`
**Status**: 🔒 Implemented
**Approved**: 2026-04-25
**Last updated**: 2026-04-25

---

### TypeScript Interfaces

```typescript
// infrastructure/stacks/auth-stack.ts
export interface AuthStackProps extends cdk.StackProps {
  readonly envName: string
}

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool
  public readonly userPoolClient: cognito.UserPoolClient
}
```

### DynamoDB Record Shapes

N/A — AuthStack provisions Cognito resources; DynamoDB writes happen in `auth-triggers-lambda` (see `designs/auth/post-confirmation.md`).

### Function Signatures

N/A — CDK stack; no Lambda functions defined directly (the auth-triggers Lambda is instantiated via `DuseumLambdaFunction` construct within the stack).

### CDK Construct Patterns

```typescript
// Cognito User Pool
const userPool = new cognito.UserPool(this, 'UserPool', {
  userPoolName: `duseum-${envName}-cognito-userpool`,
  signInAliases: { email: true },
  signInCaseSensitive: false,
  selfSignUpEnabled: true,
  autoVerify: { email: true },
  userVerification: { emailSubject: 'Verify your Duseum account', emailBody: 'Your verification code is {####}.', emailStyle: cognito.VerificationEmailStyle.CODE },
  passwordPolicy: { minLength: 8, requireUppercase: true, requireLowercase: true, requireDigits: true, requireSymbols: true, tempPasswordValidity: cdk.Duration.days(7) },
  mfa: cognito.Mfa.OPTIONAL,
  mfaSecondFactor: { otp: true, sms: false },
  standardAttributes: { email: { required: true, mutable: false } },
  accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
  deletionProtection: envName === 'prod',
  removalPolicy: envName === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
})

// App Client — SPA (no client secret)
const client = new cognito.UserPoolClient(this, 'UserPoolClient', {
  userPool,
  userPoolClientName: `duseum-${envName}-cognito-client`,
  generateSecret: false,
  authFlows: { userSrp: true },
  oAuth: { flows: { authorizationCodeGrant: true }, scopes: [EMAIL, OPENID, PROFILE], callbackUrls: [appDomain + '/callback', 'http://localhost:5173/callback'] },
  accessTokenValidity: cdk.Duration.hours(1),
  idTokenValidity: cdk.Duration.hours(1),
  refreshTokenValidity: cdk.Duration.days(30),
  preventUserExistenceErrors: true,
})

// auth-triggers Lambda — reads main table name from SSM at deploy time
const mainTableName = ssm.StringParameter.valueForStringParameter(this, `/duseum/${envName}/stacks/storage/dynamodb_main_table_name`)
const triggerFn = new DuseumLambdaFunction(this, 'auth-triggers', {
  entry: '...lambdas/auth-triggers/src/handler.ts',
  environment: { DYNAMODB_TABLE_NAME: mainTableName },
  reservedConcurrentExecutions: 10,
})
mainTableRef.grantWriteData(triggerFn.fn)
userPool.addTrigger(cognito.UserPoolOperation.POST_CONFIRMATION, triggerFn.fn)

// SSM outputs: /duseum/{env}/stacks/auth/
// user_pool_id | user_pool_client_id | user_pool_arn | post_confirm_lambda_arn
```

### Implementation Steps

1. `AuthStack` instantiated with `envName` prop from `DuseumStage`.
2. Cognito User Pool created with email sign-in, code-based email verification, optional TOTP MFA (no SMS), 8-char minimum password with all character classes.
3. App Client created with no client secret, SRP auth flow only, authorization_code OAuth flow, 1-hour access+id tokens, 30-day refresh token.
4. Callback URLs: `https://{env}.duseum.com/callback` (prod: `https://duseum.com/callback`) + `http://localhost:5173/callback` for local dev.
5. Main table name read from SSM (`valueForStringParameter` — resolves at deploy time as CloudFormation token).
6. `mainTableRef = dynamodb.Table.fromTableName(...)` created for IAM grant only.
7. `DuseumLambdaFunction` creates `auth-triggers-lambda` with `DYNAMODB_TABLE_NAME` env var and `reservedConcurrentExecutions: 10`.
8. `mainTableRef.grantWriteData(triggerFn.fn)` applies least-privilege (PutItem on main table).
9. `userPool.addTrigger(POST_CONFIRMATION, triggerFn.fn)` wires the Cognito trigger.
10. 4 SSM params written: `user_pool_id`, `user_pool_client_id`, `user_pool_arn`, `post_confirm_lambda_arn`.
11. Stack-level tags applied.

### Integration Test Fixtures

No integration tests found for AuthStack CDK construct directly. `cdk synth --strict --context env=dev` validates structure in CI.

### Decisions & Constraints

- Google OAuth IdP is **not yet implemented** — marked as `TODO` in code pending Google OAuth credentials in Secrets Manager. The spec lists it as ✅ but the code has it commented out with a TODO.
- `preventUserExistenceErrors: true` on App Client — prevents information leakage (login failure responses are identical for non-existent vs wrong-password users).
- `signInCaseSensitive: false` — email addresses treated case-insensitively.
- `email.mutable: false` on standard attributes — email cannot be changed after registration (Cognito limitation; supported via admin API only).
- `reservedConcurrentExecutions: 10` on auth-triggers-lambda — limits concurrent trigger invocations to prevent DynamoDB write storms during registration spikes.
- Cross-stack SSM wiring: `valueForStringParameter()` is a CloudFormation SSM dynamic reference, not a deploy-time value. StorageStack must be deployed before AuthStack can be deployed.
- `DuseumLambdaFunction` is a custom L2 construct in `infrastructure/constructs/lambda-function.ts` wrapping `NodejsFunction` with project-standard defaults (Node 20, bundling, IAM role naming).
