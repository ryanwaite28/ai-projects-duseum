## Design: Cognito Registration & Session Management

**Spec**: `specs/auth/cognito-registration.md`
**Status**: 🔒 Implemented
**Approved**: 2026-04-25
**Last updated**: 2026-04-25

---

### TypeScript Interfaces

```typescript
// From packages/shared/src/types/index.ts
export type UserAccount = {
  userId: string            // Cognito sub (UUID)
  email: string
  systemRole: 'USER' | 'ADMIN'
  emailVerified: boolean
  createdAt: string         // ISO 8601
  lastLoginAt: string
}
```

### DynamoDB Record Shapes

| Record type | PK | SK | Key attributes |
|---|---|---|---|
| UserAccount | `USER#{userId}` | `PROFILE` | `userId`, `email`, `systemRole`, `emailVerified`, `createdAt`, `lastLoginAt` |
| ViewerProfile | `USER#{userId}` | `PROFILE#VIEWER` | `userId`, `profileType`, `status`, `displayName`, `createdAt`, `notificationGlobalOptOut`, `defaultNotificationPref` |

Note: The actual SK for UserAccount in code is `PROFILE` (not `META` as in data-model.md). The data model doc lists `SK=META` for User base record; the implementation uses `SK=PROFILE`.

### Function Signatures

```typescript
// infrastructure/stacks/auth-stack.ts
export interface AuthStackProps extends cdk.StackProps {
  readonly envName: string
}

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool
  public readonly userPoolClient: cognito.UserPoolClient
  constructor(scope: Construct, id: string, props: AuthStackProps)
}
```

### CDK Construct Patterns

```typescript
// User Pool — email-based sign-in, SRP auth flow, optional TOTP MFA
const userPool = new cognito.UserPool(this, 'UserPool', {
  userPoolName: `duseum-${envName}-cognito-userpool`,
  signInAliases: { email: true },
  selfSignUpEnabled: true,
  autoVerify: { email: true },
  passwordPolicy: { minLength: 8, requireUppercase: true, requireLowercase: true, requireDigits: true, requireSymbols: true },
  mfa: cognito.Mfa.OPTIONAL,
  mfaSecondFactor: { otp: true, sms: false },
  accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
  deletionProtection: envName === 'prod',
  removalPolicy: envName === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
})

// App Client — SPA (no client secret), SRP only, authorization_code flow
const client = new cognito.UserPoolClient(this, 'UserPoolClient', {
  userPool,
  generateSecret: false,
  authFlows: { userSrp: true },
  accessTokenValidity: cdk.Duration.hours(1),
  refreshTokenValidity: cdk.Duration.days(30),
  oAuth: { flows: { authorizationCodeGrant: true }, scopes: [...] },
})

// SSM outputs: /duseum/{env}/stacks/auth/user_pool_id | user_pool_client_id | user_pool_arn | post_confirm_lambda_arn
```

### Implementation Steps

1. `AuthStack` is instantiated by `DuseumStage` with `envName` context.
2. Cognito User Pool created with email sign-in, SRP auth, code-based email verification, optional TOTP MFA.
3. App Client created with no client secret (SPA), SRP auth flow, 1-hour access token, 30-day refresh token, authorization_code OAuth flow.
4. Callback URLs: `https://app.{env}.duseum.com/callback` and `http://localhost:5173/callback`.
5. `DuseumLambdaFunction` construct creates `auth-triggers-lambda`; reads main DynamoDB table name from SSM at deploy time.
6. `mainTableRef.grantWriteData(triggerFn.fn)` applies least-privilege IAM.
7. `userPool.addTrigger(POST_CONFIRMATION, triggerFn.fn)` wires the trigger.
8. Four SSM parameters written under `/duseum/{env}/stacks/auth/`.
9. Google OAuth IdP: marked TODO in code — deferred until OAuth credentials are in Secrets Manager.

### Integration Test Fixtures

No integration tests found for the auth-stack CDK construct directly. Auth triggers are tested in `lambdas/auth-triggers/src/handler.integration.test.ts`.

### Decisions & Constraints

- `generateSecret: false` — SPA clients cannot safely store a client secret; this is non-negotiable for browser-based apps.
- `userSrp: true` only — password-based direct flow (`userPassword`) disabled for security.
- MFA is `OPTIONAL` (not required) in v1; users can enable TOTP authenticator app.
- `deletionProtection` and `RETAIN` removal policy only applied in `prod` — dev uses `DESTROY` for easy teardown.
- Google IdP commented out pending credential seeding; attribute mapping `email→email`, `sub→username` is documented in code.
- SSM cross-stack wiring: `valueForStringParameter()` resolves at deploy time (CloudFormation token), not synth time — avoids `Fn.importValue()`.
