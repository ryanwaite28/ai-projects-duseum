## Spec: Cognito Registration & Session Management

**Status**: ✅ Implemented
**FR coverage**: FR-AUTH-01, FR-AUTH-03, FR-AUTH-04, FR-AUTH-05, FR-AUTH-06, FR-AUTH-07
**Relevant PROJECT.md sections**: 2.1, 7.1

**What this implements**: User registration (email/password or Google OAuth), email verification requirement, JWT session management via Cognito, password reset, and account suspension mechanics.

**Prerequisites**: `infrastructure/stacks/auth-stack.ts` deployed with Cognito User Pool; Google OAuth client ID + secret in Secrets Manager; SES sender `no-reply@duseum.com` verified (pre-provisioned)

**Done when**:
- [ ] Cognito User Pool + App Client deployed via CDK; Google IdP federation configured
- [ ] JWT access token (1hr TTL) + refresh token (30-day TTL with rotation) verified
- [ ] Post-Confirmation Lambda trigger wired to `auth-triggers-lambda`
- [ ] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `infrastructure/stacks/auth-stack.ts` — Cognito User Pool + App Client; Google IdP federation; Post-Confirmation Lambda trigger wiring
- `lambdas/users/src/routes/create-author.ts` — Author profile creation (separate from Viewer auto-creation)
- `packages/shared/src/types/index.ts` — `UserRole` enum (`USER`, `ADMIN`)

**DynamoDB access patterns used**:
- User record by userId: `PK=USER#{userId}, SK=PROFILE#VIEWER` (written by Post-Confirmation trigger)
- Viewer profile by userId: `PK=USER#{userId}, SK=PROFILE#VIEWER`

**Business logic**:
1. User submits email + password (or initiates Google OAuth) → Cognito handles credential creation
2. Cognito sends verification email (hosted UI or custom SES trigger)
3. User verifies email → Cognito fires Post-Confirmation trigger → `auth-triggers-lambda` creates Viewer profile (see `specs/auth/post-confirmation.md`)
4. Session: Cognito issues access token (1hr TTL) + refresh token (30-day TTL with rotation)
5. Password reset: Cognito hosted UI sends time-limited, single-use reset link via SES
6. Account suspension: Admin sets Cognito user `Enabled=false` → all tokens immediately invalidated; all profile access blocked
7. Individual profile suspension: `suspended` flag on DynamoDB profile record (does not touch Cognito)

**Error conditions**:
- Duplicate email → Cognito returns `UsernameExistsException` → 409
- Unverified email attempts API access → JWT missing/invalid → 401
- Account suspended → token invalid → 401

**Tests to write**:
- Unit: none (Cognito handles auth; thin trigger logic tested separately)
- Integration: registration flow via Cognito SDK in test env; token issuance; refresh token rotation
