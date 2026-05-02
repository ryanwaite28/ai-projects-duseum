# Duseum — Project Retrospective

> A full lifecycle retrospective of the Duseum digital museum platform, built entirely AI-driven from a blank repository to a fully deployed, production-grade serverless application.

---

## Timeline Summary

| Date | Milestone |
|---|---|
| Apr 22 | Initial MVP scaffolded in one session from PROJECT.md |
| Apr 25 | Converted from PROMPT.md to Spec-Driven Development (SDD) |
| Apr 26 | Integration tests passing; PR #1 merged |
| Apr 27 | Deployment day — 13 PRs, major infrastructure issues discovered |
| Apr 28 | Local dev fixed; UI navigation polished |
| Apr 30 | ACM cert fix; X-Ray limit fix |
| May 1  | Stripe webhook dual-endpoint discovered; remediation phase; remaining frontend specs |
| May 2  | Final spec (#20) implemented; all 51 specs ✅ |

---

## Phase 1 — Scaffolding the MVP from PROJECT.md (Apr 22)

### What happened

The project started with a fully written `PROJECT.md` (3,800+ lines) and a `PROMPT.md` (1,125 lines) that described the entire platform. In a single AI session, the entire codebase was generated:

- 332 files, 47,000+ lines of TypeScript
- 11 Lambda functions with full business logic
- Shared `packages/shared` with all repositories, middleware, auth, Stripe, and SES utilities
- CDK infrastructure stacks (Storage, Auth, CDN, Messaging, API, Monitoring)
- React + Vite frontend with all pages, hooks, services, and design system components
- GitHub Actions CI/CD pipeline with OIDC-based deployment
- Local dev environment via MiniStack (Docker Compose) with seeding scripts
- Smoke tests, integration tests, load test scripts, bootstrap scripts

### What worked well

**PROJECT.md as the single source of truth** was the foundation of the entire project. The AI could read it cold in any session and reconstruct context completely. Every architectural decision, every DynamoDB access pattern, every Lambda assignment, every FR code — all in one document. This made AI-driven development consistent across sessions without the AI needing to explore the codebase first.

**The density paid off.** A thorough PROJECT.md that spelled out DynamoDB key patterns, Lambda inventory, Stripe webhook flows, and FR codes let the AI produce correct, non-trivial implementations on the first pass. Vague project descriptions produce vague code.

### What to carry forward

Write PROJECT.md first, before touching any code. It should include:
- FR codes (FR-AUTH-01, etc.) — traceable requirements
- Lambda inventory (which Lambda owns which routes — prevents wrong-lambda routing errors)
- DynamoDB access patterns and GSI definitions (prevents full table scans and ad-hoc GSIs)
- Pre-provisioned infrastructure table (prevents CDK from trying to recreate existing AWS resources)
- Secrets/SSM key naming conventions

---

## Phase 2 — Discovering the Problem with PROMPT.md (Apr 22–25)

### The problem

After the MVP was committed, it became clear that `PROMPT.md` had a fundamental flaw: it was static. It described what *should* be built but had no way to track what *had* been built. There was no:
- Record of which features were complete vs. pending
- Approval gate before the AI started writing code
- Mechanism to prevent the AI from re-implementing things already done
- Checklist for verifying correctness before marking something done

More critically, there was no human review step. The AI would happily start implementing as soon as it processed the prompt, with no pause for the human to say "yes, that's what I want."

### The solution — Spec-Driven Development (SDD)

On Apr 25, the project was converted to SDD in a single commit (`0f834bc`):

- `PROMPT.md` deleted (1,125 lines)
- `designs/` directory created with per-feature design documents (later superseded by `specs/`)
- `specs/` directory created with one spec per feature, each with a `**Status**` field and `**Done when**` checklist
- Five custom slash commands created: `/workflow`, `/design`, `/implement-spec`, `/spec-status`, `/sync-specs`
- `CLAUDE.md` updated with the mandatory process: **Read → Spec → Approve → Implement → Typecheck → Tick**

### The approval gate rule

The most important addition was the explicit approval phrase: the AI must receive exactly **"Approved — proceed."** before writing any implementation code. The CLAUDE.md rule reads:

> "The spec IS the approval gate — a 'yes sounds good' in chat is not an approval to write code. Only 'Approved — proceed.' unlocks implementation."

This came from a session where the AI began implementing after a vague confirmation in conversation. The strict phrase prevents that entirely and forces a moment of human review before code is written.

### The `designs/` → `specs/` simplification

The initial SDD structure had two layers: `designs/` (detailed how-to implementation guides with function signatures and test fixtures) and `specs/` (what-to-build with done-when checklists). This turned out to be over-engineered — the AI had to write a design, get it approved, then write a spec, get it approved, then implement. 

The `designs/` layer was eventually superseded: specs grew to include enough detail (business logic steps, access patterns, file lists) that the separate design document added little value. The lesson: **one approval layer is enough**. The spec format converged on:

```
## Spec: {Name}
**Status**: ⬜ Pending / ✅ Implemented
**Done when**: [ ] checkboxes
**New/modified files**: explicit file list
**Business logic**: step-by-step
**DynamoDB access patterns**: named patterns only
```

### What to carry forward

For any AI-driven project:

1. **Delete the prompt doc after scaffolding.** It has done its job. Replace it with specs immediately.
2. **Use a spec gate.** The AI must present a plan before writing code. Define an exact approval phrase and make the AI wait for it.
3. **One spec per feature, not per file.** Specs scoped to features (not individual files or endpoints) stay coherent and are easier to review.
4. **Status + done-when checklists** make completion unambiguous. "Implemented" means all boxes are checked and typecheck passes — not "looks about right."

---

## Phase 3 — Deployment Day: Discovering Infrastructure Issues (Apr 27)

The first deployment attempt resulted in 13 pull requests in a single day on the `feature/reconcile-mvp-gaps` branch. Each PR fixed a deployment blocker discovered in sequence. The issues fell into four categories.

### Issue 1: Pre-provisioned infrastructure conflicts

The AI had generated CDK code to create:
- A Route53 hosted zone for `duseum.com`
- An ACM certificate for `*.duseum.com`
- SES domain verification for `duseum.com`

All three already existed in the AWS account. CDK would either fail (zone already exists) or create duplicate resources. 

**Fix:** Added a "Pre-Provisioned Infrastructure" table to CLAUDE.md listing every resource that already existed with instructions to `fromLookup()` / `fromCertificateArn()` instead of creating. These anti-patterns were added to CLAUDE.md:
- "Don't create a new Route53 hosted zone — it already exists; use `HostedZone.fromLookup()`"
- "Don't create new ACM certificates — they already exist; use `Certificate.fromCertificateArn()`"
- "Don't configure SES verification in CDK — domain and `no-reply@duseum.com` are already verified"

### Issue 2: WAF REGIONAL cannot attach to HTTP API v2

The CDK code attached a WAF WebACL (REGIONAL scope) to the API Gateway HTTP API via `CfnWebACLAssociation`. This failed with an error: the ARN format `/apis/{id}/stages/$default` is invalid for `CfnWebACLAssociation`. AWS WAF REGIONAL only supports API Gateway **REST APIs** — not HTTP API v2.

**Fix:** Removed WAF entirely from the API stack (`ec9ee5b` — "removed WAF from stack"). WAF CLOUDFRONT scope was used on the CloudFront distributions instead. HTTP API protection came from the Cognito JWT authorizer and stage-level throttling.

This was added to CLAUDE.md:
> "Don't try to attach a WAF WebACL (REGIONAL scope) to an API Gateway HTTP API — the ARN format `/apis/{id}/stages/$default` is invalid for `CfnWebACLAssociation`."

And to PROJECT.md as an explicit NFR:
> "NFR-SEC-06: WAF (CLOUDFRONT scope) on CloudFront distributions... API Gateway HTTP API v2 is not supported by WAF REGIONAL."

### Issue 3: `addToResourcePolicy()` on an imported S3 bucket is a silent no-op

The CdnStack imported the S3 media bucket via `Bucket.fromBucketName()` (using an SSM-resolved token name) and then called `addToResourcePolicy()` on it to grant CloudFront OAC access.

**The call silently did nothing.** When a bucket is imported with an SSM token as its name, `autoCreatePolicy = false` on the imported construct means no `AWS::S3::BucketPolicy` resource is emitted. The CloudFront OAC policy never got applied, and CloudFront returned 403s on all image requests.

**Fix:** Moved the bucket policy (OAC allow statement) from CdnStack to StorageStack — the stack that *owns* the `Bucket` construct (`c850f2e` — "added bucket policies"). Only the owning stack can successfully attach a bucket policy.

This was added to CLAUDE.md:
> "Don't call `addToResourcePolicy()` on a bucket imported via `Bucket.fromBucketName()` with an SSM-resolved (token) name — `autoCreatePolicy = false` makes it a **silent no-op**... S3 bucket policies must be added in the stack that owns the `Bucket` construct (StorageStack)."

### Issue 4: Missing Lambda env var — `APP_BASE_URL`

The notification unsubscribe flow constructs a signed one-click unsubscribe link in the email. The base URL was read from an `APP_BASE_URL` environment variable in the Lambda. This variable wasn't being injected from CDK.

**Fix:** Added `APP_BASE_URL` to the Lambda environment in `api-stack.ts`. Also required updating PROJECT.md and the connect-onboarding spec which referenced the same env var for the Stripe Connect redirect flow (`1dc92cb` — "fixed app env for lambdas: APP_BASE_URL").

**Lesson:** Environment variables needed by business logic must be explicitly tracked. CDK env var injection is invisible to the AI unless the spec or CLAUDE.md explicitly lists what each Lambda environment needs.

### Issue 5: X-Ray sampling rule limit

The monitoring stack created an X-Ray sampling rule with a limit that hit a service quota (`27ba608` — "fixed xray limit"). A one-line fix, but only discoverable post-deployment.

### Lesson from deployment day

> **Deployment issues compound.** Every PR that fixes one thing reveals the next. Getting CI/CD green is the priority — don't try to ship all features simultaneously. The sequence should be: infrastructure deploys cleanly → smoke tests pass → then add features.

The pattern of 13 PRs in one day all fixing the same branch is a signal that the CI pipeline wasn't proven before business logic was written. Future projects should have a "deploy a hello world Lambda and CloudFront page" milestone before writing any domain code.

---

## Phase 4 — Stripe Webhook Dual-Endpoint Discovery (May 1)

### The problem

The initial implementation treated Stripe webhooks as a single source. In reality there are two distinct Stripe webhook sources:

1. **"Events from: Connected accounts"** — fires when something happens on a connected Express account (e.g., `customer.subscription.created` from an Author's Stripe Connect account)
2. **"Events from: Your account"** — fires for platform-level events (e.g., `account.updated` which carries `charges_enabled` / `payouts_enabled` changes)

These two sources have **separate webhook signing secrets** in Secrets Manager and **separate destination IDs**. The `account.updated` event — which is needed to update `connectChargesEnabled` on the Author profile (FR-SUB-13) — only arrives on the platform webhook, not the Connect webhook.

The initial webhook handler only handled events from the Connect webhook, so `account.updated` was never processed.

**Fix:** Added the platform webhook handler path (`94a471a` — "added new webhook processing"). Also discovered several extra subscribed events that needed to be handled gracefully:
- `customer.subscription.paused` → update status to `PAUSED`
- `customer.subscription.resumed` → update status back to `ACTIVE`
- `invoice.payment_succeeded` → acknowledge + skip
- `subscription_schedule.*` → log + skip
- `customer.subscription.trial_will_end` → log + skip

All webhook IDs and extra events were documented in CLAUDE.md's Stripe Reference table.

### Lesson

> When integrating with external services like Stripe, map out every webhook event type and every webhook source before writing handler code. Stripe has multiple webhook endpoint types with different event scopes — treating them as one will cause handlers to silently miss events.

---

## Phase 5 — Remediation: Gaps Discovered Post-Integration (May 1)

After the core infrastructure was stable and the app was accessible, an integration review revealed several missing pieces that weren't caught during spec-by-spec implementation.

### Missing endpoint: `GET /artworks/mine`

FR-ART-11 required a separate authenticated endpoint for Authors to list all their own pieces — including DRAFTs, which the public `GET /artworks` endpoint doesn't return. This endpoint existed in the spec but was never implemented in the Lambda.

The issue: the public browse endpoint (`listArtworks`) was implemented and tested, and the AI didn't notice the separate `/mine` requirement because it wasn't in the primary happy-path flow.

**Fix:** Created `specs/artworks/author-own-pieces.md` as a new remediation spec and implemented `GET /artworks/mine` (`402b034`).

**Lesson:** Endpoints that are "behind the auth wall" and only used in a specific dashboard context are the most likely to be overlooked. They don't appear in the public API surface and aren't exercised by smoke tests.

### Feature booking — current week logic

The `isWithinThreeMonthWindow()` function in `packages/shared/src/features/` had a subtle issue with booking eligibility when the selected week was the current ISO week. ISO week arithmetic (Thursday-based, per ISO 8601) is non-trivial and required explicit test coverage.

**Fix:** Created `specs/features/current-week-booking.md` to document and test the specific edge case (`402b034`).

**Lesson:** ISO 8601 week numbers are not wall-clock weeks. Always write explicit unit tests for calendar/date arithmetic functions with known-good fixture values. The `iso-week.test.ts` file had 156 lines of test cases for a reason.

### Author dashboard routing

The Author dashboard had route guard issues — the dashboard page wasn't correctly protected, and the Stripe Connect `?connect=return` / `?connect=refresh` query params (FR-SUB-11, FR-SUB-12) weren't being handled on initial load.

**Fix:** Created `specs/frontend/author-dashboard-routes.md` as a new remediation spec (`402b034`). The fix required detecting the query params in `useEffect`, invalidating the connect-status cache on `?connect=return`, and auto-triggering a fresh onboarding link on `?connect=refresh`.

### Collections route bugs

The `create-collection` and `update-collection` routes had attribute mapping errors in the DynamoDB write — fields were being set under wrong keys. Integration tests caught these.

### Frontend type drift: `viewerReaction` and `connectChargesEnabled`

Two fields existed in backend responses but were absent from the corresponding frontend TypeScript interfaces:

1. `viewerReaction: ReactionType | null` on the `Artwork` type — the backend returned it, but the `ReactionBar` component couldn't show the authenticated user's active reaction because the type didn't define the field.
2. `connectChargesEnabled: boolean | null` on `AuthorProfile` — the backend's `get-author.ts` didn't even return the field, so the Author subscription CTA was displayed regardless of whether Stripe Connect was configured.

**Lesson:** Backend and frontend types will drift. The canonical shared types in `specs/shared/types.md` and `packages/shared/src/types/index.ts` are not automatically consumed by the frontend. **Every API response shape should be verified against the frontend type when implementing the consuming UI component** — it's not enough to check that the backend returns the field.

---

## Phase 6 — Completing All Specs (May 1–2)

The final stretch covered the remaining 7 frontend specs (#14–#20) from REMAINING_SPECS_PLAN.md. Each followed the same pattern:

1. Read the spec
2. Read every file listed in "New/modified files" to gap-analyze what was already implemented vs. what was missing
3. Present a targeted diff (only what needed changing)
4. "Approved — proceed."
5. Implement only the delta
6. Run `npx turbo run typecheck` — zero errors required
7. Tick all done-when checkboxes; update Status

The gap-analysis step prevented redundant work. In every spec, substantial portions were already implemented (sometimes from the MVP phase, sometimes from previous specs). Only the true delta was written.

Notable implementations in this phase:
- **Fisher-Yates shuffle via `useMemo`** for the Weekly Featured Carousel (FR-FEAT-16 — order randomized each page load, stable during re-renders of the same data)
- **ISO 8601 current-week calculation without a library** — Thursday-based week number, avoiding a `date-fns` import
- **Native HTML5 drag-and-drop** for the pinned-pieces tab — `draggable`, `onDragStart`, `onDragOver`, `onDrop`, `onDragEnd` — no external DnD library needed
- **Optimistic UI for delete-reaction** — `onMutate`/`onError` React Query pattern with revert on failure
- **`admin-guard.tsx` middleware** — extracted to `frontend/src/middleware/` from `components/layout/AdminRoute.tsx` to satisfy the spec's done-when criterion precisely

---

## Phase 7 — Runtime Data Dependencies: The Third Category (May 2)

### What happened

Two subscription flows were broken in both dev and prod:

1. **Platform subscription checkout** returned "An unexpected error occurred" on the frontend. Investigation revealed two compounding issues: a code bug (`getConfigValue` used the wrong DynamoDB key pattern — `{ PK: 'CONFIG', SK: key }` instead of `{ PK: key }`) and a data gap — the config table in both environments was completely empty. `PLATFORM_SUB_PRICE_ID` was never seeded. Even after the code fix was deployed, the feature remained broken until the config table was populated and the Stripe platform subscription product + price were created in the prod Stripe account (the dev Stripe account had them already; prod did not).

2. **Author subscriptions** had no config table dependency, but the root confusion was the same: a runtime data gap that looked like a code bug.

The symptom — "an unexpected error occurred" — gave no indication whether the cause was code, infrastructure, or data. The first debugging instinct was to look at the code. But even perfectly correct code cannot work if the data it depends on doesn't exist in production.

### The three categories of dependencies

Any deployed feature depends on three things:

| Category | Managed by | Verified by |
|---|---|---|
| Code dependencies | npm / TypeScript imports | Typecheck, unit tests |
| Infrastructure dependencies | CDK (tables, queues, buckets) | CDK deploy, smoke tests |
| **Runtime data dependencies** | **Manual bootstrap** | **Nothing — until now** |

Only the first two are managed by CI/CD. Runtime data dependencies — the rows and items that must exist inside those infrastructure resources for features to function — are invisible to code review, typecheck, integration tests (which seed their own data), and deployment pipelines.

### Why this is easy to miss

- **Tests pass locally** — integration tests (MiniStack) seed their own config rows in `beforeAll`. Local tests passing says nothing about whether production data is seeded.
- **The error is misleading** — "Platform subscription is not configured" and "An unexpected error occurred" sound like code bugs or misconfigurations, not missing data rows.
- **The dependency is implicit** — a Lambda reads `getConfigValue('PLATFORM_SUB_PRICE_ID')` from a table that CDK creates. CDK says nothing about what must be in that table. The code says nothing about how it gets there. The gap is invisible.
- **Each environment is independent** — even if dev is seeded, prod is a separate environment with its own config table and its own Stripe account. Both must be bootstrapped independently.

### The fix

Three changes were made to prevent this class of issue going forward:

1. **`specs/infrastructure/environment-bootstrap.md`** — a new canonical spec that documents every config table key, every required Stripe resource (product ID, price ID), and every required Secret, with the current values for both environments and CLI commands to seed or verify them. Any spec that introduces a new config table key must update this document.

2. **CLAUDE.md `Runtime Data Dependencies` section** — added immediately after the Pre-Provisioned Infrastructure table. Documents the current required config keys (with dev + prod values), the associated Stripe resources, and a rule: before diagnosing a code bug on a live feature, run `/env-health` to confirm data is present.

3. **`/env-health` command** (`.claude/commands/env-health.md`) — a new slash command that checks both environments' config tables (all required keys present), Secrets Manager (all secrets present), and Stripe (price ID in config references an active Stripe Price). Surfaces missing data before debugging begins.

### General lessons (applicable to any project)

**Track runtime data dependencies explicitly, with the same rigor as code and infrastructure.** Every feature that reads from a config store, a feature-flag service, or an external API (Stripe, Twilio, SendGrid) has a runtime data prerequisite. That prerequisite must be:
  - Documented alongside the feature spec
  - Listed in an environment bootstrap document
  - Verifiable with a health check command
  - Seeded in every environment independently — local seeds do not carry over

**"Works in tests, broken in prod" often means missing runtime data, not broken code.** When a feature passes all automated tests but fails in a live environment, check the data before reading the code. The root question is: "does the data this code depends on actually exist in this environment?"

**Local test isolation is a liability as well as an asset.** Integration tests that seed their own data in `beforeAll` are correct and fast — but they prove the code works when the data is present, not that the data is present in production. The two questions are orthogonal.

**The bootstrap document is a living spec, not a one-time checklist.** Every time a feature is added that reads a config value, the bootstrap document gets a new row. Every time a new environment is provisioned, the bootstrap document is the runbook. If it's out of date, the next environment bootstrap will fail in a different place.

**Make the health check a first-class command.** The instinct when something is broken is to look at logs, read code, and re-read the spec. A `/env-health` command short-circuits that cycle by answering "is all the data present?" in 30 seconds. The command should be the first thing run when a live feature misbehaves.

---

## Phase 8 — Automated Dependency Health Checking (May 2)

### What happened

Phase 7 established that runtime data dependencies were the third, invisible category of dependencies — and added `specs/infrastructure/environment-bootstrap.md` plus the `/env-health` command to document and surface them. But the fix was reactive: it required a human to remember to run `/env-health` when something broke.

Two questions remained unanswered:

1. **How do you catch a missing prerequisite _before_ CDK deploys?** If `bootstrap.sh` was not run, CDK deploy would proceed and fail silently at runtime (not at deploy time). The pipeline had no early-warning signal.

2. **How do you catch a seeded-but-wrong data dependency _after_ CDK deploys, before marking the pipeline green?** Smoke tests proved the API was reachable, but never checked whether the data those API routes depended on was present and correct.

Additionally, `bootstrap.sh` itself was discovered to be incomplete: it seeded Secrets Manager and SSM (§1–3) and provisioned CloudFront keys, OIDC, and IAM roles (§4–6), but it omitted two critical items:
- **§3.6** — DynamoDB config table seeding (the six static config keys)
- **§3.7** — Stripe platform subscription product + price provisioning and `PLATFORM_SUB_PRICE_ID` seeding

Local MiniStack mode (lines 261–273 of `bootstrap.sh`) DID seed the config table, creating the false impression that bootstrap was complete. In production mode, the config table was left empty.

### The fix

**Three layers**, each addressing a different point in the deployment lifecycle:

#### Layer 1: `bootstrap.sh` completeness (provisioning)

Added §3.6 and §3.7 to `bootstrap.sh`:

- **§3.6** `seed_config_table()` — seeds all six static config keys (`PLATFORM_CUT_PERCENT`, `FREE_TIER_LIMIT`, `WEEKLY_FEATURE_FEE_USD`, `WEEKLY_FEATURE_SLOT_COUNT`, `WEEKLY_FEATURE_ADVANCE_WEEKS`). Idempotent — uses `attribute_not_exists(PK)` condition expression.
- **§3.7** `provision_stripe_platform_price()` — checks SSM at `/duseum/{env}/stripe/platform_price_id` first; if the price ID already exists, skips creation (idempotency via SSM as the guard). Otherwise: calls Stripe API to create a product + $10/month price, stores the price ID in SSM, then seeds `PLATFORM_SUB_PRICE_ID` into the config table.

Both sections run for dev and prod. `scripts/.secrets.env.example` was rewritten to document what bootstrap creates vs. what the operator must supply (Stripe keys and webhook secrets only).

#### Layer 2: `_pre-deploy-check.yml` — shift-left, parallel with Build

A new reusable workflow that runs **in parallel with the Build job** (both need only `[ci]`; Deploy gates on both). Zero pipeline latency overhead when prerequisites are healthy.

Script: `scripts/pre-deploy-check.sh {env}`

Checks only things `bootstrap.sh` creates — not CDK-managed resources (DynamoDB tables, SQS, Lambda don't exist yet on first deploy and should not block CDK):
- S3 bucket `duseum-cicd-artifacts`
- 7 Secrets Manager secrets (`duseum/{env}/stripe/*`, `duseum/{env}/cloudfront/*`, `duseum/{env}/hmac/*`)
- SSM: `/duseum/{env}/cloudfront/key_pair_id`, `/duseum/{env}/stripe/platform_price_id`
- IAM roles: `duseum-github-actions-deploy-{env}`, `duseum-github-actions-build`

Failure message is concrete: "Run `bash scripts/bootstrap.sh` to provision missing prerequisites."

#### Layer 3: `_dep-check.yml` — post-deploy, gates smoke tests

A new reusable workflow that runs after `Deploy Frontend` and must pass before `Smoke Test`. Script: `scripts/dep-check.sh {env}`.

**Smart failure logic** — the key insight is that "table not found" and "key not found" are different failure modes requiring different fixes:

| Condition | Cause | Fix |
|---|---|---|
| `describe-table` → `ResourceNotFoundException` | CDK deploy failed | Re-run CDK deploy |
| Table present, key missing | bootstrap.sh §3.6 not run | Re-run bootstrap.sh |
| Key present, value is `REPLACE_WITH_*` placeholder | bootstrap.sh §3.7 did not complete | Re-run bootstrap.sh |
| Key present, Stripe price inactive | Price was manually archived | Create new price, re-run bootstrap |

This distinction prevents a real pipeline failure (CDK deploy broke something) from being misdiagnosed as an operator error (forgot to run bootstrap), and vice versa.

### Pipeline shape after this phase

```
CI → [Build ∥ Bootstrap Check] → Deploy → Deploy Frontend → Dep Check → Smoke Test
```

`Bootstrap Check` and `Build` run in parallel. `Deploy` gates on both. `Smoke Test` gates on `Dep Check`. The pipeline now catches all three failure categories before marking a deployment green.

### Lessons learned

**A provisioning script that is incomplete is worse than no provisioning script.** An incomplete script creates the false impression that setup is done — the operator runs it, sees success, and moves on. The missing items stay missing and surface as mysterious runtime failures later. Every category of required external resource must be in the provisioning script: secrets, SSM, S3 buckets, DynamoDB config seeds, Stripe resources, IAM, OIDC. If it isn't in bootstrap.sh, it isn't bootstrapped.

**Local test modes that seed their own data are not a reliable indicator of bootstrap completeness.** MiniStack mode in `bootstrap.sh` seeded the config table. This created the appearance that seeding was handled. In production mode, it was not. Whenever a local-only code path covers something the production path omits, the omission will only be discovered in production.

**Pipeline health checks should be assertive, not passive.** A smoke test that checks HTTP 200 on the login endpoint says nothing about whether the config table is seeded. The health check must specifically verify the data the features depend on — not just that the infrastructure is reachable.

**"Smart" failure messages save debugging time.** The difference between "dependency check failed" and "config table not found — this usually means CDK deploy failed; re-run the deploy workflow" is the difference between 30 minutes of debugging and 5 minutes of action. When a health check fails, the error message should name the specific resource, its expected state, and the command to fix it.

**The provisioning script and the pre-deploy check must evolve together.** When bootstrap.sh adds a new provisioned resource, pre-deploy-check.sh must add the corresponding verification. If they drift, the check provides false assurance. Encode this as a rule in CLAUDE.md: "When adding a section to bootstrap.sh, add the corresponding check to pre-deploy-check.sh."

**Make runtime data dependencies first-class citizens of the spec process.** Before this phase, a spec could be written and implemented without ever specifying what data it depended on at runtime. After: every spec that introduces a new config key or external resource dependency must (1) add it to dep-check.sh, (2) add provisioning to bootstrap.sh, (3) update the environment-bootstrap doc, (4) include done-when items for seeding both environments. The spec gate now covers runtime data, not just code and infrastructure.

---

## Cross-Cutting Lessons

### 1. The spec gate applies to everything — including test fixes and CI failures

Without the "Approved — proceed." gate, AI will interpret ambiguous approval ("sounds good", "okay", "yes") as license to implement. Requiring a specific exact phrase creates a hard checkpoint that forces the human to read the spec before implementation begins.

**The spec gate also prevents the AI from implementing more than requested.** Because the spec lists exactly which files are in scope, the AI can't silently add "helpful" changes to files not on the list.

**The most dangerous case is a failing test.** When CI reports a test failure, the immediate AI instinct is to make the error go away — usually by fixing the implementation to satisfy the test. But the test may be wrong. The correct sequence is:

1. Read PROJECT.md for the relevant FR
2. Read the spec for the expected behavior
3. Present which side is wrong (implementation or test) with citations
4. Wait for "Approved — proceed."
5. Fix only the wrong side

This was learned directly: a `DELETE /follows/authors/{authorId}` test expected a 404 when the follow record didn't exist. The AI fixed the implementation to throw `NotFoundError` — but the spec explicitly stated "no-op if record doesn't exist → 200." The implementation was correct; the test was wrong. The fix was caught only because the human asked "does that change align with PROJECT.md?" — a question that should have been answered *before* any file was touched.

**Encode this as a rule:** skipping the spec step for a CI failure is exactly the scenario where it matters most. A wrong test silently passes after the fix, locking in incorrect behavior permanently.

### 2. CLAUDE.md is institutional memory for AI sessions

Every time a new AI session opens, it has no memory of what happened before. The "Common Mistakes" section in CLAUDE.md is a permanent record of errors that occurred, with exact instructions on what to do instead. Each mistake was added immediately after it was discovered:
- WAF REGIONAL → documented after the failed CDK deploy
- Silent bucket policy no-op → documented after CloudFront 403s
- Two Stripe webhook sources → documented after `account.updated` was missed
- `APP_BASE_URL` → documented after the unsubscribe link broke in staging

**Treat CLAUDE.md like a CI linting rule that can't be automated.** If a mistake happens once, encode the prevention instruction into CLAUDE.md so it can't happen again.

### 3. Typecheck as the definition of done

`npx turbo run typecheck` with zero errors is a non-negotiable gate before marking any spec complete. It catches:
- Missing fields in interfaces
- Wrong types on API response shapes
- Unused imports that signal dead code
- Props passed to components that don't exist on the type

TypeScript typecheck is not a substitute for tests, but it is the fastest signal that the implementation is internally consistent.

### 4. Monorepo + `packages/shared` is essential for AI-driven multi-Lambda projects

With 11 Lambda functions, each needing access to DynamoDB, Stripe, SES, Secrets Manager, and CloudFront signing, having all of that logic in `packages/shared` meant:
- The AI only wrote each repository function once
- All Lambdas imported from the same canonical source — no drift between them
- Typecheck across the entire monorepo caught cross-package issues

Without shared packages, the AI would have generated 11 copies of the DynamoDB client, 11 copies of the Stripe initialization, and they would have diverged.

### 5. Single-table DynamoDB design requires discipline but scales well with AI

The pre-defined access patterns in PROJECT.md Section 4.7 (with every PK/SK/GSI spelled out) meant the AI never had to decide how to model data. It just followed the table. This prevented:
- Full table scans
- Ad-hoc GSIs added mid-project
- Inconsistent key naming between Lambdas

**The access pattern table is the DynamoDB schema. Write it in PROJECT.md before writing any code.**

### 6. Custom slash commands encode the workflow

The `/workflow`, `/design`, `/implement-spec`, `/devops`, and `/pm-review` commands in `.claude/commands/` turned the process into repeatable steps. Rather than typing "now let's audit the spec coverage" every session, `/workflow` did it automatically. Rather than manually checking whether all done-when items were ticked, `/spec-status` scanned every spec file.

**The commands are a force-multiplier on the spec-gate process.** They also document the process itself — a new developer (or a new AI session) can read the command files to understand how the project works.

### 7. Pre-seeded Stripe and AWS resources — document IDs immediately

Both Stripe account IDs, both Connect Client IDs, all four webhook destination IDs — these were added to CLAUDE.md the moment they were provisioned. Discovering them later (from the Stripe dashboard, from AWS console) breaks the flow and introduces risk of using wrong IDs.

**Anything manually provisioned that the AI will reference should be in CLAUDE.md within the same session it is created.**

### 8. Two-environment isolation within one AWS account

Using `{env}` prefix on every resource name (`duseum-dev-dynamodb-main`, `duseum-prod-dynamodb-main`) to isolate dev and prod within the same AWS account worked cleanly. The CDK note about running bootstrap sequentially (dev first, then prod) was important — parallel bootstrap runs on the same account failed with resource conflicts.

### 9. Tests are not optional — they are the proof that implementation is correct

The project had strong backend integration tests (Vitest + MiniStack, real DynamoDB) but two significant gaps:

1. **`GET /authors/{authorId}` had zero integration tests.** The backend returns `{ profile: {...}, gallery: {...} }` — a two-key wrapper — but the frontend service was written to treat the response as a flat `AuthorProfile`. This went undetected for the entire development period because no test ever asserted the response shape. The bug only surfaced as a runtime crash in the browser (`followerCount.toLocaleString()` on `undefined`).

2. **The frontend had no test infrastructure at all** — no vitest, no `@testing-library/react`, no `test` script in `package.json`. Service-layer mapping functions (`getAuthor`, `getAuthorCollections`) were never unit-tested, so field-name mismatches and shape-wrapping bugs were invisible until the page crashed.

**The pattern that would have prevented both crashes:**
- Every new Lambda route needs an integration test that asserts the exact response shape (not just the status code)
- Every frontend service function that maps an API response needs a unit test that feeds in a mock API response and asserts the mapped output field by field

**The rule encoded in CLAUDE.md as of this project:** Step 6 of the mandatory process is now "Write or update tests." A spec is not done until tests exist and pass.

---

## Process: Ordered Steps for an AI-Driven Project from Scratch

Based on this project, the recommended sequence for a future production-grade AI-driven project:

```
1.  Write PROJECT.md (single source of truth)
    - FR codes, NFRs, Lambda inventory, DynamoDB access patterns,
      pre-provisioned infra table, secrets/SSM naming conventions

2.  Scaffold the full codebase from PROJECT.md in one AI session
    - Accept that it will be imperfect — this generates structure, not perfection

3.  Immediately delete PROMPT.md / initial prompt artifact
    Replace with specs/

4.  Convert to SDD (Spec-Driven Development)
    - One spec per feature with Status + Done-when
    - Define the approval gate phrase ("Approved — proceed.")
    - Create /workflow and /implement-spec commands

5.  Deploy a "hello world" to both environments before adding any features
    - Proves CDK, IAM, OIDC, and CI/CD are working
    - Surfaces infra issues (WAF incompatibilities, bucket policies, cert lookups)
      before business logic is entangled

6.  Add CLAUDE.md Common Mistakes section
    - Start empty; add every infra/CDK surprise as it is discovered

7.  Implement specs in dependency order (foundational → social → monetization → admin → frontend)
    - Read spec → gap-analyze existing code → present delta → "Approved — proceed." → implement
    - Run typecheck after each spec; fix before marking done

8.  Remediation pass after first integration
    - Use smoke tests / manual exploration to find gaps (missing endpoints, type drift)
    - Create new specs for each gap — don't patch ad-hoc

9.  Complete all frontend specs with gap-analysis
    - Never write the whole page from scratch if it already exists
    - Read existing files, identify delta, implement only the delta

10. Final FR coverage check
    - grep all FR codes from PROJECT.md vs. specs/
    - All non-deferred FRs must appear in at least one ✅ Implemented spec
```

---

## What Would Be Done Differently

1. **Get CI/CD and a minimal deploy working on day 1.** The deployment-day gauntlet of 13 PRs would have been shorter if a hello-world Lambda + static S3 page were deployed before any business logic was written.

2. **Enumerate Lambda env vars in the spec.** Each spec that creates or modifies a Lambda should list the env vars that Lambda reads. The `APP_BASE_URL` gap would have been caught at spec-approval time.

3. **Map Stripe webhook event types at the start.** Listing all expected events + their sources (Connect vs. platform) in a `specs/subscriptions/webhook-processing.md` table up front would have prevented the dual-endpoint discovery mid-project.

4. **Run `tsc --noEmit` against the frontend on every Lambda spec.** Several frontend type-drift issues (`viewerReaction`, `connectChargesEnabled`) would have been caught earlier if the full monorepo typecheck ran after each backend spec, not just the Lambda-side typecheck.

5. **One PR per spec.** The 13-PRs-in-one-day pattern made git history hard to read. One spec = one branch = one PR keeps history auditable.

6. **Require the spec step even for test failures.** A CI failure is not a shortcut around the process — it is the scenario where the process matters most. The correct side to fix (implementation vs. test) cannot be determined without first reading PROJECT.md and the spec. Encode this explicitly in CLAUDE.md from the start, not as an afterthought.

7. **Bootstrap frontend test infrastructure on day 1.** The frontend had no test runner, no `@testing-library/react`, and no `test` script in `package.json` for the entire project. Adding it after-the-fact required retrofitting. If `vitest` + `@testing-library/react` had been wired up in the initial scaffold, service-layer unit tests would have been written alongside every feature spec.

8. **Make the provisioning script complete and verifiable from the start.** `bootstrap.sh` was written early but omitted DynamoDB config seeding and Stripe resource provisioning — the two items that caused the Phase 7 incident. If every category of external dependency (secrets, SSM, S3, DynamoDB seeds, Stripe resources, IAM, OIDC) had been added to bootstrap.sh at the time the feature was first specced, the runtime data gaps would never have existed. Pair the provisioning script with a pre-deploy health check from day 1, so any missing prerequisite fails the pipeline before CDK runs.

---

*Completed: 51 specs implemented, all functional requirements covered, project fully deployed to dev and prod environments.*
