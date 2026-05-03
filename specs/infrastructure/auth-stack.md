## Spec: Auth Stack (Cognito)

**Status**: ✅ Implemented
**FR coverage**: FR-AUTH-03, FR-AUTH-04, FR-AUTH-05, FR-AUTH-06
**Relevant PROJECT.md sections**: 7.1, 5, 13.5

**What this implements**: CDK AuthStack provisioning Cognito User Pool + App Client; Google OAuth IdP federation; Post-Confirmation trigger wiring to auth-triggers-lambda.

**Prerequisites**: `storage-stack.md` deployed; Google OAuth credentials seeded in Secrets Manager; SES `no-reply@duseum.com` verified (pre-provisioned)

**Done when**:
- [x] `cdk synth --strict --context env=dev` passes with zero warnings
- [x] User Pool deployed with correct password policy and token TTLs (access 1 hr, refresh 30 days)
- [x] Post-Confirmation trigger wired to `auth-triggers-lambda`
- [x] Google IdP configured with credentials read from Secrets Manager (not hardcoded)
- [x] App Client has no client secret (public client)
- [x] 3 SSM outputs written under `/duseum/{env}/stacks/auth/`
- [x] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `infrastructure/stacks/auth-stack.ts` — User Pool, App Client, Google IdP, Lambda trigger

**Cognito User Pool configuration**:
- Password policy: min 8 chars, requires uppercase + lowercase + number + symbol
- MFA: optional (TOTP or SMS)
- Email verification: required (custom SES sender `no-reply@duseum.com`)
- Token validity: access token 1hr, refresh token 30 days with rotation
- Username attributes: email (not username)
- Lambda triggers: Post-Confirmation → `auth-triggers-lambda`

**App Client**:
- No client secret (SPA — public client)
- OAuth flows: authorization_code, implicit
- Allowed scopes: openid, email, profile
- Callback URLs: `https://app.{env}.duseum.com/auth/callback`, `http://localhost:5173/auth/callback`

**Google IdP** (federation):
- ClientId + ClientSecret from Secrets Manager at deploy time
- Attribute mapping: `email → email`, `sub → username`

**SSM outputs** (`/duseum/{env}/stacks/auth/`):
- `cognito_user_pool_id`
- `cognito_user_pool_arn`
- `cognito_client_id`

**`auth-triggers` IAM additions** (see `specs/notifications/transactional-emails.md`):
- `AuthTriggerSes`: `ses:SendEmail`, `ses:SendRawEmail` on `*`
- `AuthTriggerSesFromSecret`: `secretsmanager:GetSecretValue` on `duseum/{env}/ses/from-address`
- Env var added: `APP_BASE_URL` (`https://duseum.com` prod, `https://{env}.duseum.com` dev)

**Tags**: `Project=duseum`, `Environment={env}`, `Stack=auth`, `ManagedBy=CDK`

**Tests to write**:
- CDK unit: User Pool created with correct token validity; Lambda trigger attached; App Client has no secret
