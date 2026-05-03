## Spec: Post-Confirmation Trigger — Viewer Profile Auto-Creation

**Status**: ✅ Implemented
**FR coverage**: FR-AUTH-02, FR-PROF-01, FR-VIEW-01
**Relevant PROJECT.md sections**: 2.1, 2.2, 2.3, 4.2

**What this implements**: Cognito Post-Confirmation Lambda trigger that automatically creates a Viewer profile in DynamoDB when a user verifies their email — no additional setup required. Also fires a welcome email (fire-and-forget) via `sendWelcomeEmail`. See `specs/notifications/transactional-emails.md`.

**Prerequisites**: DynamoDB main table deployed; `packages/shared/src/db/users.repository.ts` exists (or will be created); `auth-triggers-lambda` wired as Cognito Post-Confirmation trigger

**Done when**:
- [ ] `createViewerProfile()` and `getUserById()` functions implemented in shared repo
- [ ] Integration test seeds Cognito Post-Confirmation event → verifies `PK=USER#{userId}, SK=PROFILE#VIEWER` record created in DynamoDB
- [ ] Duplicate-trigger idempotency verified: second trigger → no error, no duplicate record (`ConditionalCheckFailedException` swallowed)
- [ ] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `lambdas/users/src/routes/create-author.ts` — creates Author profile (separate opt-in flow)
- `packages/shared/src/db/users.repository.ts` — `createViewerProfile()`, `getUserById()`

**DynamoDB access patterns used**:
- Write Viewer profile: `PK=USER#{userId}, SK=PROFILE#VIEWER`
- Write User base record: `PK=USER#{userId}, SK=META`

**Business logic**:
1. Cognito fires `PostConfirmation_ConfirmSignUp` trigger after email verification
2. `auth-triggers-lambda` handler receives Cognito event; extracts `sub` (userId) and `email`
3. Write base User record (`PK=USER#{userId}, SK=META`) with email, createdAt, role=`USER`
4. Write Viewer profile (`PK=USER#{userId}, SK=PROFILE#VIEWER`) with status=`ACTIVE`, createdAt
5. Both writes are idempotent (`attribute_not_exists(PK)` condition — safe to re-run if trigger fires twice)
6. Handler returns Cognito event unchanged (Cognito requires the original event back)

**Error conditions**:
- DynamoDB write failure → log error + rethrow (Cognito will retry trigger up to 3×)
- User already exists (duplicate trigger) → `ConditionalCheckFailedException` caught and swallowed silently

**Tests to write**:
- Unit: `createViewerProfile()` repository function with mocked DynamoDB
- Integration: seed Cognito-like event, verify DynamoDB records created with correct PK/SK pattern
