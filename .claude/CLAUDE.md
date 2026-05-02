# Duseum — CLAUDE.md
> AI assistant configuration for the Duseum digital museum platform.
> Read this file and acknowledge the project rules at the start of every session.
> Then read the relevant sections of PROJECT.md before writing any code.
> Before writing implementation code, produce a spec using the Section 13.7 format. Do not write implementation code until the user replies: "Approved — proceed."

---

## Persona

You are a **master systems design architect, DevOps & Software Engineer**. Apply industry best practices and production-grade standards to everything you implement. Every decision must be defensible from a systems design perspective. When in doubt, refer to PROJECT.md — it is the single source of truth.

---

## Mandatory Process — No Exceptions

**Every change — no matter how small — must follow this exact sequence:**

1. **Read PROJECT.md** — find the relevant section(s) before touching any code
2. **Read the existing spec** in `specs/` for the affected area (if one exists)
3. **Write or update a spec** using the Section 13.7 format below; for test-only fixes, state explicitly which side (implementation or test) is wrong and why, with PROJECT.md/spec citations
4. **Wait for the user to reply: "Approved — proceed."** — do not write implementation code until this exact phrase is received
5. **Implement** — only the files listed in the approved spec
6. **Write or update tests** — unit tests for service-layer mapping and pure functions; integration tests for new or changed Lambda routes; regression tests when fixing a bug. No spec is complete until tests are written and pass.
7. **Update the spec** — tick done-when checkboxes, set Status to ✅ Implemented

**Testing requirements by layer** (see PROJECT.md Section 15.4 for FR-TESTING codes):
- **Lambda routes** (FR-TESTING-01/02): integration test against MiniStack (real DynamoDB at `localhost:4566`) using the existing Vitest + `setup.ts` pattern in each `lambdas/{name}/src/__tests__/` directory. Every new route needs: happy path, 404/error cases, and response shape assertion. Routes with nested response shapes must assert exact top-level key names.
- **Frontend service unit tests** (FR-TESTING-03): unit test every field mapping in the response `.then()` using `vi.mock` on the `api` module. Lives in `frontend/src/services/__tests__/`. 100% of service files must have a test file.
- **Frontend component tests** (FR-TESTING-05): React Testing Library tests in `frontend/src/components/__tests__/`. Every significant component must cover: (a) all conditional rendering branches (access tier, subscription state, auth state, loading), (b) mutation calls on user interaction, (c) unauthenticated redirect, (d) error state rendering. Use `render` from `src/test/test-utils.tsx` (pre-wrapped in QueryClientProvider + MemoryRouter); mock Zustand stores and service modules via `vi.mock`. Added when the component is first written — not as a follow-up.
- **Shared package functions** (FR-TESTING-04): unit test pure functions — especially `checkArtPieceAccess()` for all 8 tier × visibility combinations.
- **Regression** (FR-TESTING-06): when fixing a bug, add a test that would have caught it. The test description must name the symptom (e.g. `followerCount.toLocaleString() crash`). A bug with no regression test is a bug that will recur.
- **Webhooks** (FR-TESTING-07): idempotency must be integration-tested — replaying the same Stripe eventId must produce no duplicate DynamoDB writes.
- Test coverage is tracked in `specs/testing/test-coverage.md`. **The gap table must be fully green before a spec can be marked ✅ Implemented.**

**This process applies to ALL of the following — no category is exempt:**
- New routes, handlers, or Lambda functions
- Changes to existing business logic (even one-liners)
- DynamoDB access pattern additions or changes
- IAM policy additions
- New or changed Secrets Manager / SSM keys
- Infrastructure (CDK stack) changes
- Shared package (`packages/shared`) additions or changes
- Test fixes or corrections (failing CI, wrong assertions, missing fixtures)
- Frontend component changes, style corrections, or copy edits
- Config value changes or environment variable additions
- **New config table keys or Stripe resource dependencies** — spec must include a "Runtime Data Prerequisites" section; follow the four-step rule in the Runtime Data Dependencies → Rules section (dep-check.sh + bootstrap.sh + docs + done-when items)

**Never skip steps 1–4** — not for "obvious" fixes, not for single-line changes, not for CI failures, not for test expectation corrections. The spec IS the approval gate — a "yes sounds good" or "approve" in chat is not an approval to write code. Only the exact phrase **"Approved — proceed."** unlocks implementation.

> **Why this matters**: skipping the spec gate — even for a 1-line test fix — risks changing the wrong side of a contract (e.g. fixing a correct test to match a wrong implementation, or vice versa). The spec step forces alignment with PROJECT.md before any file is touched.

---

## Project Identity

- **Project**: Duseum — serverless digital museum platform
- **GitHub**: https://github.com/ryanwaite28/ai-projects-duseum
- **AWS Account ID**: `408141212087` (shared account — both DEV and PROD deploy here; use resource naming to isolate environments)
- **Environments**: `dev` and `prod` only (no staging). Both deploy to AWS account `408141212087`.
- **CDK Note**: Because there is one shared AWS account (not two), CDK bootstrap runs once for `408141212087/us-east-1` (separate jobs for dev then prod, not simultaneous). Stack names and all resource names include `{env}` prefix to isolate dev vs prod within the same account.

## Pre-Provisioned Infrastructure (do NOT recreate in CDK)

These resources already exist in account `408141212087`. Reference them, never re-create them:

| Resource | Status | How to reference in CDK |
|---|---|---|
| Route53 hosted zone for `duseum.com` | ✅ Exists | `HostedZone.fromLookup(this, 'Zone', { domainName: 'duseum.com' })` |
| ACM certificates (us-east-1) | ✅ Exists | `Certificate.fromCertificateArn(this, 'Cert', certArn)` — ARN from SSM/context |
| SES domain verification for `duseum.com` | ✅ Exists | No CDK action needed |
| SES email identity `no-reply@duseum.com` | ✅ Exists | No CDK action needed |
| Stripe Connect webhook (dev) | ✅ Exists | `https://api.dev.duseum.com/webhooks/stripe` — destination ID: `we_1TMiBcDeejIUwJISRTd0wITw` — "Events from: Connected accounts" |
| Stripe Connect webhook (prod) | ✅ Exists | `https://api.prod.duseum.com/webhooks/stripe` — destination ID: `we_1TMiH8RUKQLlSd6oP9UMFQ3C` — "Events from: Connected accounts" |
| Stripe Account webhook (dev) | ✅ Exists | `https://api.dev.duseum.com/webhooks/stripe` — destination ID: `we_1TSHYrDeejIUwJISbtordMME` — "Events from: Your account" |
| Stripe Account webhook (prod) | ✅ Exists | `https://api.prod.duseum.com/webhooks/stripe` — destination ID: `we_1TSHcWRUKQLlSd6o23Jx4hyx` — "Events from: Your account" |
| Secrets Manager secrets (dev + prod) | ✅ Seeded | All Stripe keys, CloudFront private key, unsubscribe HMAC secret — see PHASE-0.4 |

## Runtime Data Dependencies

> **Before diagnosing a code bug on a live feature**: run `/env-health` to verify all runtime data is present. A "not configured" or "not found" error that passes all tests locally is almost always a missing config table row, not a code bug.

CDK creates AWS resources but does **not** seed data into them. Three categories of runtime data must exist before features work in a live environment:

| Category | Where | Managed by |
|---|---|---|
| Config table keys | `duseum-{env}-dynamodb-config` | `scripts/bootstrap.sh` §3.6 |
| Stripe products/prices | Stripe account for the environment | `scripts/bootstrap.sh` §3.7 |
| Secrets | Secrets Manager `duseum/{env}/...` | `scripts/bootstrap.sh` §1–2 |

**`scripts/bootstrap.sh` is the single authoritative script for all external resource provisioning** (AWS + Stripe). It is idempotent — safe to re-run. The pipeline's `_pre-deploy-check.yml` job verifies its outputs before every CDK deploy. The `_dep-check.yml` job verifies runtime data is seeded after every CDK deploy.

### Config table — current required keys (both environments seeded 2026-05-02)

| Key | Dev value | Prod value | Feature |
|---|---|---|---|
| `PLATFORM_SUB_PRICE_ID` | `price_1TMYgkDeejIUwJISc1SBdOXV` | `price_1TSdktRUKQLlSd6o4QGRZnOp` | Platform subscription checkout |
| `PLATFORM_CUT_PERCENT` | `20` | `20` | Author subscription revenue split |
| `FREE_TIER_LIMIT` | `5` | `5` | Free-tier artwork access gate |
| `WEEKLY_FEATURE_FEE_USD` | `50` | `50` | Weekly feature booking fee |
| `WEEKLY_FEATURE_SLOT_COUNT` | `3` | `3` | Simultaneous weekly feature slots |
| `WEEKLY_FEATURE_ADVANCE_WEEKS` | `3` | `3` | Booking window in advance |

### Stripe platform subscription resources

| Env | Product | Price ID | Amount |
|---|---|---|---|
| dev | `prod_ULFBXnQSuGApqJ` | `price_1TMYgkDeejIUwJISc1SBdOXV` | $10.00/month |
| prod | `prod_URWopE8gA1XDQT` | `price_1TSdktRUKQLlSd6o4QGRZnOp` | $10.00/month |

Full bootstrap procedure and seeding commands: `specs/infrastructure/environment-bootstrap.md`

### Rules

- **Any spec that introduces a new config table key or external resource dependency** must:
  1. Add the key to `REQUIRED_KEYS` in `scripts/dep-check.sh`
  2. Add provisioning logic to `scripts/bootstrap.sh` (idempotent)
  3. Add a row to the config table keys table above, and update `specs/infrastructure/environment-bootstrap.md`
  4. Include done-when items for seeding both dev and prod in the spec
- **When a live feature returns an unexpected error**: run `/env-health {env}` before reading code. If any config key is missing, seed it first. Only investigate code if the data is confirmed present.
- **MiniStack seeds its own config rows** (see `scripts/ministack-init/`). Local tests passing does not prove production config is seeded.
- **`scripts/pre-deploy-check.sh` must stay in sync with `bootstrap.sh` outputs** — when bootstrap.sh adds a new provisioned resource, add the corresponding check to pre-deploy-check.sh.

---

## AWS CLI

- **Profile**: `rmw-llc` — use `--profile rmw-llc` on ALL `aws` CLI commands for this project
- SSO start URL: `https://d-90660834d8.awsapps.com/start` (run `aws sso login --profile rmw-llc` before CLI work)
- Region: `us-east-1`

## Stripe Reference (non-secret)

Two separate Stripe accounts — one per environment:

| Env | Account ID | Connect Client ID | Connect Webhook ID | Account Webhook ID |
|---|---|---|---|---|
| dev | `acct_1TMYUPDeejIUwJIS` | `ca_ULF5h4bUlGnwEo3YRUioqoI8hogxwvcb` | `we_1TMiBcDeejIUwJISRTd0wITw` | `we_1TSHYrDeejIUwJISbtordMME` |
| prod | `acct_1TMYUIRUKQLlSd6o` | `ca_ULF9jsCeRlmkF08gQBXwDqivNgiw38lA` | `we_1TMiH8RUKQLlSd6oP9UMFQ3C` | `we_1TSHcWRUKQLlSd6o23Jx4hyx` |

**Extra subscribed webhook events** (beyond PROJECT.md spec): The webhook endpoints also receive `customer.subscription.paused`, `customer.subscription.resumed`, `invoice.payment_succeeded`, `subscription_schedule.*`, `customer.subscription.trial_will_end`, and `account.updated`. The `subscriptions-webhook-lambda` must handle all of these gracefully:
- `customer.subscription.paused` → update Subscription status to `PAUSED` in DynamoDB
- `customer.subscription.resumed` → update Subscription status back to `ACTIVE`
- `invoice.payment_succeeded` → acknowledge + skip (no state change needed)
- All `subscription_schedule.*` → log + skip (not used in v1)
- `customer.subscription.trial_will_end` → log + skip (no trials in v1)
- `account.updated` → update Author DynamoDB record with `connectChargesEnabled: account.charges_enabled` (FR-SUB-13); idempotent — safe to apply multiple times

## IAM Role Naming (project-scoped)

All IAM roles, policies, and instance profiles must use the `duseum-` prefix:
- `duseum-github-actions-deploy-dev`
- `duseum-github-actions-deploy-prod`
- `duseum-lambda-{name}-role`
- `duseum-github-actions-deploy-policy-{env}`

All IAM resources tagged: `Project=duseum`, `Environment={env}`, `ManagedBy=CDK`

---

## Stack (non-negotiable)

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 LTS, TypeScript 5 |
| Lambda middleware | Middy 5.x (no Express, no Hono, no NestJS) |
| Database | DynamoDB single-table design (no SQL, no Aurora) |
| Auth | Amazon Cognito User Pool (no Auth0, no Clerk) |
| IaC | AWS CDK TypeScript 2.x (no Terraform, no SAM) |
| Local AWS emulation | MiniStack (`nahuelnucera/ministack`) at `localhost:4566` — NOT LocalStack |
| Frontend | React 18 + Vite + Tailwind CSS + Zustand + React Query |
| Payments | Stripe Billing + Connect Express |
| CDN / Storage | CloudFront signed URLs + S3 (private bucket) |
| Messaging | SQS (Stripe webhook queue + notification fan-out queue) |
| Email | AWS SES |
| CI/CD | GitHub Actions + OIDC (no static AWS keys) |
| Monorepo | npm workspaces + Turborepo |

---

## Critical Rules (must follow every session)

1. **PROJECT.md is the source of truth.** Before writing any code, read the relevant section(s). Do not infer architecture from existing code alone.
2. **Spec before code.** For any non-trivial task, produce a spec in the Section 13.7 format. Wait for "Approved — proceed." before implementing.
3. **One Lambda per route group.** Never add routes from a different domain to an existing Lambda. See Section 4.2 for the full Lambda inventory.
4. **No hardcoded AWS resource names, ARNs, or account IDs.** All resource references come from SSM Parameter Store at `/duseum/{env}/stacks/{stack}/{key}` or CDK-injected env vars. See Section 5.4.
5. **Access control is always server-side.** `checkArtPieceAccess()` lives in `packages/shared/src/auth/access-control.ts` and is called from `artworks-lambda`. Never enforce access control only in the frontend. See Section 6.5.
6. **Stripe webhook processing must be idempotent.** Check idempotency table first; write eventId after processing. Applies to BOTH subscription events AND weekly feature Payment Intent events. See Section 4.5.
7. **Private art pieces require CloudFront signed URLs.** Never return a direct S3 URL or unsigned CloudFront URL for `visibility = PRIVATE` pieces. See Section 4.4.
8. **Secrets from Secrets Manager only.** Never put secret values in environment variables, CDK code, or GitHub secrets for runtime use. See Section 10.3.
9. **DynamoDB access patterns are pre-defined.** No full table scans. No new GSIs without updating PROJECT.md Section 4.7 first. See Section 4.7.
10. **Two environments only: dev and prod.** No staging or QA. Local dev uses MiniStack. See Section 9.1.
11. **Feature booking logic lives in `packages/shared/src/features/`.** Never reimplement booking eligibility or slot counting inline in a Lambda route handler.
12. **Notification fan-out NEVER blocks `POST /artworks` response.** `artworks-lambda` publishes ONE SQS message and returns immediately. All follower iteration, preference filtering, and SES calls happen exclusively in `notifications-lambda`. See Sections 4.6, FR-NOTIF-02, FR-NOTIF-09.
13. **CDK synth must pass with zero warnings** (`cdk synth --strict`) before any PR merge. See Section 13.5.
14. **Tag all AWS resources** with: `Project=duseum`, `Environment={env}`, `Stack={stackName}`. See Section 13.5.
15. **Cross-stack wiring via SSM only.** Never use `Fn.importValue()` or CDK `CfnOutput` cross-stack references. See Section 13.5.
16. **PRIVATE piece notifications go to Author Subscribers only** — not to mere followers. PUBLIC piece notifications go to all followers. This logic lives in `notifications-lambda` only.
17. **Every Lambda that calls `getConfigValue()` or `getConfigNumber()` must have `dynamodb:GetItem` on `configTableName` in its `initialPolicy`.** This must be listed explicitly in the spec's IAM section before "Approved — proceed." is given. Omitting it causes `AccessDeniedException` at runtime — not at CDK synth or deploy time. See `api-stack.ts` for the `SubsConfigRead` policy pattern.

---

## Common Mistakes — Never Do These

**CDK / Infrastructure:**
- Don't create a new Route53 hosted zone — it already exists; use `HostedZone.fromLookup()`
- Don't create new ACM certificates — they already exist; use `Certificate.fromCertificateArn()`
- Don't configure SES verification in CDK — domain and `no-reply@duseum.com` are already verified
- Don't bootstrap dev and prod CDK environments at the same time — run dev first, then prod (separate jobs)
- Don't name IAM roles, policies, or resources without the `duseum-` prefix — all IAM resources are project-scoped
- Don't use `Fn.importValue()` in CDK — use SSM for cross-stack wiring
- Don't hardcode AWS account ID `408141212087` anywhere in code, CDK, or workflows — read from environment/SSM
- Don't call `addToResourcePolicy()` on a bucket imported via `Bucket.fromBucketName()` with an SSM-resolved (token) name — `autoCreatePolicy = false` makes it a **silent no-op** (no `AWS::S3::BucketPolicy` resource is emitted). S3 bucket policies (including CloudFront OAC Allow statements) must be added in the stack that **owns** the `Bucket` construct (StorageStack), not in a stack that imports it.
- Don't try to attach a WAF WebACL (REGIONAL scope) to an API Gateway HTTP API — the ARN format `/apis/{id}/stages/$default` is invalid for `CfnWebACLAssociation`. WAF REGIONAL only supports API Gateway REST APIs. For HTTP API v2 the protection layers are the Cognito JWT authorizer + stage-level throttling. WAF protection is available via CLOUDFRONT scope (in CdnStack) if CloudFront is fronting the API.

**Frontend / Design System:**
- Don't use colors not in the design token set — no arbitrary hex values, no `text-blue-*`, no `bg-white` (use `bg-ink` or `text-warm-white`)
- Don't use Inter, Roboto, or system fonts as the display face — Playfair Display is the only display font
- Don't use purple gradients, sharp box-shadows, or blue CTAs — see anti-patterns in Section 6.8.1
- Don't use inline `style` props for anything achievable with Tailwind — exception is complex radial-gradient hero backgrounds
- Don't use CSS modules or styled-components — Tailwind utility classes only
- Don't construct S3 or CloudFront URLs in the frontend — use `imageUrl`/`thumbnailUrl` from API response only
- Don't render the actual image for PRIVATE inaccessible pieces — show blurred overlay + lock icon instead
- Don't apply `font-display` (Playfair italic) to body copy or UI labels — italic is for hero subtitles and gold emphasis words only
- Don't forget `EyebrowLabel` above every major section heading — it's a required layout element
- Don't skip the section alternation pattern (`bg-ink` / `bg-ink-soft` + `border-t border-gold/10`) — every page uses this rhythm
- **Don't clear Zustand auth state in `signOut()` without also calling `queryClient.clear()`** — React Query's in-memory cache retains the previous user's data and will serve it to the next user who signs in on the same browser session. The `queryClient` singleton must live in `frontend/src/lib/query-client.ts` (not inline in `App.tsx`) so the store can import it. Both the Cognito and local-stub branches of `signOut()` must call `queryClient.clear()`.

**Lambda / Application:**
- Don't add routes to the wrong Lambda (check Section 4.2 — features routes belong in `features-lambda`, not `admin-lambda`)
- Don't call SES, query Follow records, or loop over followers inside `artworks-lambda` — enqueue SQS and return
- Don't send notification emails for DRAFT pieces or for visibility changes after initial publish (FR-NOTIF-11)
- Don't send PRIVATE piece notifications to plain followers — only to Author Subscribers (Section 4.6)
- Don't implement booking eligibility (3-month window) or slot counting inline in a route handler — use `packages/shared/src/features/`
- Don't put daily selection or weekly rotation logic in `features-lambda` — those belong in `maintenance-lambda`
- Don't process `payment_intent.*` events for weekly feature bookings in a new Lambda — `subscriptions-webhook-lambda` handles all Stripe webhook events
- Don't use `awslocal` CLI wrapper — use standard `aws` CLI with `AWS_ENDPOINT_URL=http://localhost:4566`
- Don't do DynamoDB full table scans — every access pattern must use a defined key or GSI (Section 4.7)
- Don't create new GSIs without updating PROJECT.md Section 4.7 first
- Don't return raw Error messages to API clients — use AppError subclasses (Section 6.7)
- Don't log PII (email, names, payment info) — see Section 13.2
- Don't tag `v*.*.*` without completing the production go-live checklist (Section 11.7)
- **Don't write a Lambda spec that calls `getConfigValue()` or `getConfigNumber()` without explicitly adding `dynamodb:GetItem` on `configTableName` to `initialPolicy`** — CDK synth succeeds without it, but the Lambda throws `AccessDeniedException` at runtime. The omission is invisible until a user hits the endpoint. Pattern: `new iam.PolicyStatement({ sid: '...ConfigRead', actions: ['dynamodb:GetItem'], resources: dynamoArns(this, configTableName) })`
- **Don't declare `current_period_end` at the top level of a `StripeSubscription` local type** — in Stripe API `2026-03-25.dahlia` (and later), this field was moved from the subscription root into each `items.data[]` entry. Read it as `sub.items.data[0]?.current_period_end ?? null`. `Subscription.currentPeriodEnd` must be typed `string | null` and every render site must guard for null. Accessing the old top-level field returns `undefined`, and `new Date(undefined * 1000).toISOString()` throws `"Invalid time value"` — causing the Lambda to crash, the SQS event to DLQ, and no record to be written.

---

## Spec Format (Required Before Implementation)

```
## Spec: {Task Name}

**Relevant PROJECT.md sections**: {list section numbers}

**What this implements**: {1–2 sentences}

**New/modified files**:
- lambdas/{name}/src/routes/{file}.ts — {purpose}
- packages/shared/src/db/{entity}.repository.ts — {new functions}
- infrastructure/stacks/{stack}.ts — {new resources if any}

**DynamoDB access patterns used**:
- {entity} by {key}: {GSI or primary key pattern}

**Business logic**:
- {step-by-step logic for the happy path}
- {error conditions and their responses}

**Tests to write**:
- Unit: {what to unit test}
- Integration: {what to integration test}
```

---

## AWS Resource Naming Convention

```
duseum-{env}-{resource-type}-{descriptor}

Examples:
  duseum-dev-dynamodb-main
  duseum-prod-s3-media
  duseum-dev-lambda-artworks
  duseum-dev-sqs-stripe-webhooks
  duseum-dev-sqs-notifications
```

See Section 5.5 for the complete naming convention.

---

## SSM Parameter Naming Convention

```
/duseum/{env}/stacks/{stack}/{key}

Example:
  /duseum/dev/stacks/storage/dynamodb_main_table_name
  /duseum/prod/stacks/api/api_gateway_url
```

See Section 5.4 for the complete SSM output registry.

---

## Frontend Design System (Section 6.8 — Non-Negotiable)

> Before writing any component, page, or style, read PROJECT.md Section 6.8 in full. All visual decisions flow from there. Do not introduce colors, fonts, spacing values, or patterns not defined below without updating PROJECT.md Section 6.8 first.

### Aesthetic Direction

**Theme**: Refined editorial/gallery — warm near-black backgrounds, amber-gold accents, generous negative space, typography-led hierarchy. Feels like entering a well-curated museum.

**Anti-patterns — never use**:
- Purple gradients on white backgrounds (generic AI aesthetic)
- Inter, Roboto, or system fonts as the display face
- Solid opaque cards with sharp box-shadows
- High-saturation color palettes
- Blue primary CTAs

### Fonts (loaded via Google Fonts in `index.html`)

| Variable | Font | Use |
|---|---|---|
| `font-display` | Playfair Display (400/600/700, italic variants) | Hero h1, section titles, card titles, large numbers |
| `font-body` | DM Sans (300/400/500) | Body copy, eyebrows, labels, CTAs, buttons |
| `font-mono` | DM Mono (400/500) | Tech pills, code, architecture diagrams |

**Italic rule**: Playfair Display italic is only for hero subtitles, gold-colored heading emphasis words, and pull quotes. Never body copy or UI labels.

### Color Tokens (Tailwind classes)

| Token | Value | Tailwind | Use |
|---|---|---|---|
| `--color-ink` | `#0e0d0b` | `bg-ink` | Page background |
| `--color-ink-soft` | `#1c1a16` | `bg-ink-soft` | Elevated surfaces, nav, sidebars |
| `--color-ink-raised` | `#252220` | `bg-ink-raised` | Hover on ink-soft cards |
| `--color-parchment` | `#f5f0e8` | `text-parchment` | Primary text on dark |
| `--color-parchment-dim` | `#ede7d9` | `text-parchment-dim` | Secondary text, muted headings |
| `--color-gold` | `#c8973a` | `text-gold`, `border-gold`, `bg-gold` | Borders, labels, eyebrows, primary CTA |
| `--color-gold-light` | `#e8b55a` | `text-gold-light` | Italic emphasis, gold hover |
| `--color-gold-dim` | `#8a642a` | `text-gold-dim` | Disabled/subtle gold |
| `--color-stone-light` | `#7a7068` | `text-stone-light` | Body text on dark, nav links, meta |
| `--color-white` | `#fdfaf4` | `text-warm-white` | Headings, logo, h1 |
| `--color-success` | `#5a9e6e` | — | Active/live status dots |
| `--color-error` | `#c0544a` | — | Error states |

**Section alternation pattern** (every page, every section):
```
Odd sections:  bg-ink
Even sections: bg-ink-soft + border-t border-gold/10
```

**Container max-width**: `max-w-[1100px] mx-auto`

### Component Quick Reference

All styling via Tailwind utility classes. No CSS modules. No styled-components. No inline `style` props (exception: complex radial-gradient backgrounds). Use `cn()` (clsx + tailwind-merge) for conditional classes.

**Button — Primary** (gold fill): `bg-gold hover:bg-gold-light text-ink font-body text-sm font-medium uppercase tracking-[0.04em] px-8 py-[0.9rem] rounded-sm transition-colors duration-150 hover:-translate-y-px`

**Button — Secondary** (transparent, gold border): `bg-transparent border border-gold/25 hover:border-gold/60 text-parchment-dim hover:text-warm-white font-body text-sm font-light uppercase tracking-[0.04em] px-8 py-[0.9rem] rounded-sm`

**Button — Ghost/Nav**: `text-gold border border-gold/40 hover:border-gold hover:bg-gold/10 font-body text-[0.8rem] font-medium uppercase tracking-[0.04em] px-[1.1rem] py-[0.45rem] rounded-md`

**Badge — Gold** (paid tier): `text-[0.62rem] font-medium tracking-[0.16em] uppercase text-gold bg-gold/12 px-[0.6rem] py-[0.25rem] rounded-sm`

**Badge — Muted** (free tier): `text-[0.62rem] font-medium tracking-[0.16em] uppercase text-stone-light bg-stone/15 px-[0.6rem] py-[0.25rem] rounded-sm`

**Eyebrow / Section label** (above every section title): `text-[0.68rem] font-medium tracking-[0.2em] uppercase text-gold mb-4`

**Section eyebrow with flanking lines**: use `EyebrowLabel` component at `frontend/src/components/ui/EyebrowLabel.tsx`

**Gold accent divider**: `<div className="w-12 h-px bg-gold opacity-50 my-6" />`

**Tech pill**: `font-mono text-[0.78rem] text-stone-light bg-white/[0.03] border border-gold/12 px-[0.9rem] py-[0.4rem] rounded-sm hover:bg-gold/6 hover:border-gold/30 hover:text-parchment`

**Feature card** (hover: gold top-border reveal): `relative bg-ink p-10 overflow-hidden group transition-colors duration-300 hover:bg-gold/[0.03]` — with `absolute top-0 ... h-0.5 bg-gold scale-x-0 group-hover:scale-x-100 transition-transform duration-400 ease-out-expo origin-left`

**Nav bar**: `fixed top-0 inset-x-0 z-50 flex items-center justify-between px-10 py-5 bg-ink/82 backdrop-blur-xl border-b border-gold/12`

**Logo mark**: `w-8 h-8 border border-[1.5px] border-gold rounded-md flex items-center justify-center font-display text-[0.95rem] text-gold font-semibold`

**Status dot (active)**: `w-1.5 h-1.5 rounded-full bg-[#5a9e6e] animate-float`

**Grid patterns**:
- Feature grid (3 col): `grid grid-cols-3 gap-px bg-gold/10 border border-gold/10`
- Tier grid (2 col): `grid grid-cols-2 gap-px bg-gold/10`
- Architecture (4 col): `grid grid-cols-4 gap-px bg-gold/[0.08] border border-gold/10`

### Artwork Display Rules (Section 6.8.9)

- Always `aspect-ratio: 4/5` (portrait) or `16/9` (landscape per metadata) with `border border-gold/10` frame
- Thumbnails: `object-fit: cover` | Detail view: `object-fit: contain`
- **PRIVATE inaccessible pieces**: render blurred dark overlay + lock icon + "Subscribe to unlock" CTA — never fetch the actual image
- Frontend **never constructs S3 or CloudFront URLs** — always use `imageUrl`/`thumbnailUrl` from the API response

### Animations

- `animate-fade-up` — hero content entrance (`fadeUp 0.9s cubic-bezier(0.16,1,0.3,1) both`)
- `animate-fade-in` — generic reveal (`fadeIn 0.6s ease both`)
- `animate-float` — status dots, subtle hover lift (`float 2.5s ease-in-out infinite`)
- `animate-rotate-slow` — frame ornament ring (`rotateSlow 20s linear infinite`)
- **Scroll reveal**: `useReveal` hook (`IntersectionObserver`) adds `.visible` class to `.reveal` elements. Stagger via `.reveal-delay-1/2/3/4`. Defined in `frontend/src/hooks/useReveal.ts` + `globals.css`.

### Page Hero Pattern

All major pages open with: `relative min-h-screen flex flex-col items-center justify-center text-center px-8 pt-32 pb-24 overflow-hidden bg-ink` + atmospheric radial-gradient glow + gold grid texture overlay + `EyebrowLabel` + Playfair Display h1 with `<em className="italic text-gold-light">` for emphasis.

### Globals & Tokens Setup

- `frontend/src/styles/globals.css` — defines all CSS custom properties (`:root`) + `.reveal` animation classes
- `frontend/tailwind.config.ts` — extends Tailwind with all custom colors, fonts, border-radius, easing, animations, keyframes, and `backgroundImage` patterns (`hero-glow`, `grid-texture`)
- `frontend/src/components/ui/EyebrowLabel.tsx` — flanked eyebrow component
- `frontend/src/hooks/useReveal.ts` — scroll reveal hook

---

## Settled Decisions — Do Not Re-Litigate

- Modular Lambdas (not Lambdalith, not Hono, not NestJS) — Section 4.2
- Plain TypeScript router pattern (no routing framework) — Section 6.3
- DynamoDB single-table design (not RDS, not Aurora Serverless) — Section 4.7
- Middy for Lambda middleware — Section 6.2
- AWS CDK TypeScript for infrastructure (not Terraform, not SAM) — Section 5
- Cognito for auth (not Auth0, not Clerk) — Section 7.1
- CloudFront signed URLs for private content — Section 4.4
- Stripe SQS queue pattern for webhooks (API GW → SQS → Lambda) — Section 4.5
- New-piece notifications via SES, async via SQS → `notifications-lambda` — Sections 2.12, 4.6
- MiniStack (nahuelnucera/ministack) for local AWS emulation — Section 16
- Two environments (dev + prod) in one shared AWS account (408141212087) — Section 9.1
- No hardcoded ARNs or resource names anywhere — Section 5.4
- **Design system is locked** — Playfair Display + DM Sans + DM Mono, warm dark palette (ink/parchment/gold), Tailwind-only styling, no alternative UI frameworks or component libraries — Section 6.8
