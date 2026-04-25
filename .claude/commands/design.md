# /design

Create or update an implementation guide (`designs/{domain}/{spec-name}.md`) for a spec. The design bridges the spec's "what" and the code's "how" — exact function signatures, DynamoDB record attribute names, Middy handler boilerplate, integration test fixtures, and ordered implementation steps.

**A design must exist with `**Status**: ✅ Approved` before `/implement-spec` will proceed.**

## Usage

```
/design specs/{domain}/{spec-name}.md
```

**Retroactive mode** (spec is `✅ Implemented`): reads actual implementation files and documents what was built. Status is set to `🔒 Implemented` — no approval needed.

**Forward mode** (spec is `⬜ Pending`): reads the spec + PROJECT.md sections + existing shared files and produces a design guide. Waits for user approval before implementation can begin.

---

## Steps

### 1. Determine mode and output path

Read `specs/{domain}/{spec-name}.md`. Note the `**Status**` field.

The design file mirrors the spec path under `designs/`:
- Spec: `specs/auth/post-confirmation.md`
- Design: `designs/auth/post-confirmation.md`

If a design file already exists at that path, read it first to understand what has already been decided.

### 2. Read source material

**Always read:**
- `specs/data-model.md` — canonical DynamoDB record shapes and attribute names
- `specs/shared/types.md` — canonical TypeScript interfaces; check before defining new ones
- All PROJECT.md sections listed in the spec's `**Relevant PROJECT.md sections**`

**If retroactive mode (`✅ Implemented`):**
Read every file listed in the spec's `**New/modified files**` that exists on disk. Use the actual code as the source of truth — the design documents what is, not what was planned.

**If forward mode (`⬜ Pending`):**
Read any existing shared files this spec will modify (e.g., `packages/shared/src/types/index.ts`, relevant repository files). Use the spec's `**Business logic**` and `**DynamoDB access patterns**` as the source of truth.

### 3. Produce the design document

Write `designs/{domain}/{spec-name}.md` using this format exactly:

---

```markdown
## Design: {Spec Name}

**Spec**: `specs/{domain}/{spec-name}.md`
**Status**: ⬜ Draft
**Approved**: —
**Last updated**: {today's date YYYY-MM-DD}

---

### TypeScript Interfaces

Canonical shapes for all entities this spec creates or consumes. If an interface is already defined
in `specs/shared/types.md`, reference it rather than redefining. Only document new or extended types.

\```typescript
// packages/shared/src/types/index.ts (or the file where these are defined)
export interface ExampleEntity {
  pk: string;           // USER#{userId}
  sk: string;           // PROFILE#VIEWER
  status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  createdAt: string;    // ISO 8601
}
\```

### DynamoDB Record Shapes

Every record this spec reads or writes. Attribute names must match `specs/data-model.md` exactly.

| Record type | PK | SK | Attributes written |
|---|---|---|---|
| Viewer profile | `USER#{userId}` | `PROFILE#VIEWER` | `status`, `email`, `displayName`, `createdAt` |

Include ConditionExpressions for writes that enforce uniqueness or idempotency:
- `createViewerProfile`: `attribute_not_exists(PK)` — idempotent, swallows ConditionalCheckFailedException

### Function Signatures

Exact TypeScript signatures for every function in the spec's **New/modified files**.

\```typescript
// packages/shared/src/db/users.repository.ts
export async function createViewerProfile(userId: string, email: string): Promise<void>;
export async function getUserById(userId: string): Promise<User | null>;

// lambdas/users/src/triggers/post-confirmation.ts
export const handler: Handler = async (event: PostConfirmationTriggerEvent): Promise<PostConfirmationTriggerEvent>;
\```

### Handler Boilerplate

If this spec includes Lambda HTTP route handlers, show the exact Middy setup. For Cognito triggers or
EventBridge handlers, show the appropriate handler signature instead.

**HTTP route handler:**
\```typescript
import middy from '@middy/core';
import httpJsonBodyParser from '@middy/http-json-body-parser';
import { errorHandler } from '@packages/shared/middleware/error-handler';
import { requireAuth } from '@packages/shared/middleware/require-auth';

const rawHandler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  // implementation
};

export const handler = middy(rawHandler)
  .use(httpJsonBodyParser())
  .use(requireAuth())   // omit for public routes
  .use(errorHandler());
\```

**Cognito trigger:**
\```typescript
export const handler: PostConfirmationTriggerHandler = async (event) => {
  // must return event unchanged
  return event;
};
\```

**CDK construct patterns** (infrastructure specs only — replace this section):
\```typescript
// Show exact CDK API calls, fromLookup patterns, SSM reads, etc.
\```

### Implementation Steps

Ordered steps — more granular than the spec's Business logic. Each step maps to at most one file.
Reference exact DynamoDB attribute names from the record shapes table above.

1. **Create `packages/shared/src/db/users.repository.ts`**
   - Import `DynamoDBDocumentClient`, `PutCommand`, `GetCommand` from `@aws-sdk/lib-dynamodb`
   - `createViewerProfile(userId, email)`:
     - PutItem: `{ PK: \`USER#\${userId}\`, SK: 'PROFILE#VIEWER', status: 'ACTIVE', email, createdAt: new Date().toISOString() }`
     - ConditionExpression: `'attribute_not_exists(PK)'`
     - Catch `ConditionalCheckFailedException` → swallow (idempotent)
   - `getUserById(userId)`:
     - GetItem: `{ PK: \`USER#\${userId}\`, SK: 'META' }`
     - Return `null` if `Item` is undefined

2. **Update `lambdas/users/src/triggers/post-confirmation.ts`**
   - Call `createViewerProfile(event.userName, event.request.userAttributes.email)`
   - Also write base User record: `{ PK: \`USER#\${userId}\`, SK: 'META', email, role: 'USER', createdAt }`
   - Return `event` unchanged

### Integration Test Fixtures

Exact seed data structures and assertion shapes for integration tests.
Tests use MiniStack (`localhost:4566`) — see `specs/shared/test-infrastructure.md`.

\```typescript
// Seed event
const cognitoEvent: PostConfirmationTriggerEvent = {
  version: '1',
  triggerSource: 'PostConfirmation_ConfirmSignUp',
  region: 'us-east-1',
  userPoolId: 'us-east-1_TEST',
  userName: 'test-user-001',
  callerContext: { awsSdkVersion: 'test', clientId: 'test-client' },
  request: {
    userAttributes: {
      sub: 'test-user-001',
      email: 'test@example.com',
      email_verified: 'true',
    },
  },
  response: {},
};

// Expected DynamoDB record (use GetItem to assert after handler runs)
const expectedViewer = {
  PK: 'USER#test-user-001',
  SK: 'PROFILE#VIEWER',
  status: 'ACTIVE',
  email: 'test@example.com',
};
\```

### Decisions & Constraints

Non-obvious implementation choices, CLAUDE.md constraints that apply here, and anything that
would surprise a future implementer.

- `ConditionalCheckFailedException` is swallowed — duplicate Cognito trigger is not an error
- Returns the Cognito event object unchanged — Cognito triggers require the original event as response
- Does not log `email` — PII logging is prohibited (CLAUDE.md §13.2)
- Uses `attribute_not_exists(PK)` not `attribute_not_exists(SK)` — PK is always indexed
```

---

### 4. Set design Status

**If retroactive mode** (spec `**Status**` is `✅ Implemented`):
- Set the design's `**Status**`: `🔒 Implemented` and `**Approved**`: `{today's date}`
- Do not wait for approval — implementation already exists and the design is a historical record

**If forward mode** (spec `**Status**` is `⬜ Pending`):
- Set the design's `**Status**`: `⬜ Draft` and `**Approved**`: `—`
- Print exactly:
  ```
  Design draft created at designs/{domain}/{spec-name}.md

  Review the design — function signatures, DynamoDB attribute names, handler boilerplate,
  and implementation steps. When ready, reply:

    Approved — design is approved.

  After approval, run /implement-spec specs/{domain}/{spec-name}.md to implement.
  ```

### 5. Approval handling

When the user replies "Approved — design is approved.":
- Edit `designs/{domain}/{spec-name}.md`
- Change `**Status**: ⬜ Draft` → `**Status**: ✅ Approved`
- Change `**Approved**: —` → `**Approved**: {today's date YYYY-MM-DD}`
- Print:
  ```
  ✅ Design approved. Run /implement-spec specs/{domain}/{spec-name}.md to begin implementation.
  ```

---

## Design Status Reference

| Status | Meaning | Can run /implement-spec? |
|---|---|---|
| `⬜ Draft` | Created but not yet reviewed | No — gate blocks |
| `✅ Approved` | Reviewed and approved | Yes |
| `🔒 Implemented` | Retroactive design — documents completed implementation | Already done |

---

## Notes

- If implementing reveals a needed change (new attribute, different function signature), update the design first and get re-approval before continuing
- For infrastructure specs, replace "Handler Boilerplate" with "CDK Construct Patterns"
- The `specs/data-model.md` is authoritative for DynamoDB attribute names — if the design and data-model disagree, fix data-model.md first
- Never copy-paste the spec's Business logic verbatim into Implementation Steps — the design must translate to concrete code actions (exact attribute names, ConditionExpressions, import paths)
