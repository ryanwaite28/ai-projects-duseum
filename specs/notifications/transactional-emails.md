## Spec: Transactional Email Confirmations

**Status**: ✅ Implemented
**FR coverage**: FR-NOTIF-12 (new), FR-AUTH-02, FR-SUB-03, FR-SUB-13, FR-FEAT-17
**Relevant PROJECT.md sections**: 2.12, 4.2, 4.5, 4.6, 10.3, 13.5

**What this implements**: Transactional (event-triggered) email confirmations for 10 platform events using Handlebars HTML templates and AWS SES. All emails are fire-and-forget — they never block the primary Lambda response or Stripe webhook acknowledgement.

---

## Email event map

| Event | Template | Recipient | Trigger |
|---|---|---|---|
| User signed up | `welcome.html` | viewer email | `auth-triggers` PostConfirmation |
| Platform subscription started | `platform-sub-started.html` | viewer email | `customer.subscription.created` (PLATFORM) |
| Platform subscription canceled | `platform-sub-canceled.html` | viewer email | `customer.subscription.deleted` (PLATFORM) |
| Author subscription started (viewer) | `author-sub-started-viewer.html` | viewer email | `customer.subscription.created` (AUTHOR_SUB) |
| Author subscription canceled (viewer) | `author-sub-canceled-viewer.html` | viewer email | `customer.subscription.deleted` (AUTHOR_SUB) |
| Author subscription started (author) | `author-sub-started-author.html` | author email | `customer.subscription.created` (AUTHOR_SUB) |
| Author subscription canceled (author) | `author-sub-canceled-author.html` | author email | `customer.subscription.deleted` (AUTHOR_SUB) |
| Stripe Connect onboarding complete | `connect-onboarding-complete.html` | author email | `account.updated` (charges_enabled: false→true) |
| New platform subscriber (admin) | `platform-new-subscriber.html` | `admin@duseum.com` | `customer.subscription.created` (PLATFORM) |
| Weekly feature booked (admin) | `platform-feature-booked.html` | `admin@duseum.com` | `payment_intent.succeeded` (WEEKLY_FEATURE) |

---

## Template data contracts

| Template | Variables |
|---|---|
| `welcome.html` | `{ displayName, browseUrl }` |
| `platform-sub-started.html` | `{ displayName, currentPeriodEnd, browseUrl, manageUrl }` |
| `platform-sub-canceled.html` | `{ displayName, manageUrl }` |
| `author-sub-started-viewer.html` | `{ viewerDisplayName, authorDisplayName, authorUrl, currentPeriodEnd, manageUrl }` |
| `author-sub-canceled-viewer.html` | `{ viewerDisplayName, authorDisplayName, authorUrl, manageUrl }` |
| `author-sub-started-author.html` | `{ authorDisplayName, dashboardUrl }` |
| `author-sub-canceled-author.html` | `{ authorDisplayName, dashboardUrl }` |
| `connect-onboarding-complete.html` | `{ authorDisplayName, dashboardUrl }` |
| `platform-new-subscriber.html` | `{ userId, currentPeriodEnd? }` |
| `platform-feature-booked.html` | `{ authorId, authorDisplayName, isoWeek, feeUsd }` |

---

## Architecture

### Shared email module (`packages/shared/src/email/`)

| File | Purpose |
|---|---|
| `html.d.ts` | TypeScript ambient module declaration for `*.html` imports (`declare module '*.html'`) |
| `ses.ts` | SES client singleton; `sendHtmlEmail(to, subject, html)` using `getSesFromAddress()` from Secrets Manager |
| `transactional.ts` | Imports all 10 HTML templates; pre-compiles with `Handlebars.compile()` at module init (cold start, cached); exports 10 named send functions |
| `index.ts` | Barrel re-export of `transactional.ts` + `ses.ts` |
| `templates/*.html` | 10 Handlebars HTML templates — dark editorial theme, inline CSS, table-based layout for email-client compatibility |

`packages/shared/src/index.ts` exports `* from './email/index.js'`.

### esbuild integration

`_build-lambdas.yml` uses `--loader:.html=text` so esbuild inlines HTML files as string literals in the bundle. No `fs.readFileSync` at runtime. `transactional.ts` carries `/// <reference path="./html.d.ts" />` so TypeScript resolves `*.html` module imports in both the shared package's own tsconfig and in consuming lambda tsconfigs.

### Fire-and-forget pattern

All email sends use an immediately-invoked async IIFE with a top-level catch to ensure Lambda execution is never delayed or failed by SES:

```typescript
void (async () => {
  try {
    const account = await getUserAccount(client, userId)
    if (!account?.email) return
    await sendWelcomeEmail(account.email, { ... })
  } catch (err) {
    logger.error('Failed to send email', { userId, err })
  }
})()
```

### URL construction

URLs are built from `APP_BASE_URL` env var (set in `commonEnv` in `api-stack.ts` and individually in `auth-stack.ts`):
- `browseUrl`: `${APP_BASE_URL}/browse`
- `manageUrl`: `${APP_BASE_URL}/settings`
- `dashboardUrl`: `${APP_BASE_URL}/dashboard`
- `authorUrl`: `${APP_BASE_URL}/authors/${authorId}`

### Admin email address

`SES_ADMIN_ADDRESS` env var = `admin@duseum.com`, set on `subscriptions-webhook` lambda in `api-stack.ts`. Default fallback `admin@duseum.com` is also hardcoded as the fallback in `payment-intent-events.ts` and `subscription-events.ts`.

---

## Business logic

### `auth-triggers` — welcome email

After `createUserAccount()` + `createViewerProfile()` succeed, fire `sendWelcomeEmail` with:
- `to`: `event.request.userAttributes['email']`
- `displayName`: email username part (`email.split('@')[0]`)
- `browseUrl`: `${APP_BASE_URL}/browse`

### `subscription-events.ts` — subscription started/canceled

**`handleSubscriptionCreated`** (after `upsertSubscription` + counter increment):
1. Fetch `getUserAccount(client, userId)` + `getViewerProfile(client, userId)` in parallel
2. If `targetId === 'PLATFORM'`: send `sendPlatformSubStartedEmail` to viewer + `sendPlatformNewSubscriberEmail` to admin
3. If `targetId !== 'PLATFORM'` (AUTHOR_SUB): fetch author account + author profile in parallel; send `sendAuthorSubStartedViewerEmail` to viewer + `sendAuthorSubStartedAuthorEmail` to author (skipped if author has no email)

**`handleSubscriptionDeleted`** (after `upsertSubscription` + counter decrement):
- Same pattern with canceled variants (`sendPlatformSubCanceledEmail` / `sendAuthorSubCanceledViewerEmail` + `sendAuthorSubCanceledAuthorEmail`)

**`handleSubscriptionUpdated`, `handleSubscriptionPaused`, `handleSubscriptionResumed`**: no email sent (only the explicit created/deleted lifecycle events trigger email to avoid double-sends)

### `account-events.ts` — Connect onboarding complete

Reads `existingProfile.connectChargesEnabled` before `updateAuthorProfile()`. If `!wasChargesEnabled && account.charges_enabled`, fires `sendConnectOnboardingCompleteEmail` to the author.

### `payment-intent-events.ts` — feature booked admin notification

After `updateBookingStatus()` on `payment_intent.succeeded` (WEEKLY_FEATURE), fetches `getAuthorProfile` and fires `sendPlatformFeatureBookedEmail` to admin with `feeUsd = Math.round(pi.amount / 100)`.

---

## IAM changes

### `auth-stack.ts` — `auth-triggers` lambda

New `initialPolicy` statements:
- `AuthTriggerSes`: `ses:SendEmail`, `ses:SendRawEmail` on `*`
- `AuthTriggerSesFromSecret`: `secretsmanager:GetSecretValue` on `duseum/{env}/ses/from-address`

New env var: `APP_BASE_URL` (`https://duseum.com` for prod, `https://{env}.duseum.com` for dev)

### `api-stack.ts` — `subscriptions-webhook` lambda

New `initialPolicy` statements:
- `WebhookSes`: `ses:SendEmail`, `ses:SendRawEmail` on `*`
- `WebhookSesFromSecret`: `secretsmanager:GetSecretValue` on `duseum/{env}/ses/from-address`

New env var: `SES_ADMIN_ADDRESS` = `admin@duseum.com`

---

## Dependencies added

- `handlebars ^4.7.8` — Handlebars template engine (in `packages/shared/package.json`)
- `@aws-sdk/client-ses ^3.693.0` — SES client (in `packages/shared/package.json`)

---

## New/modified files

- `packages/shared/src/email/html.d.ts` — NEW: `*.html` ambient module declaration
- `packages/shared/src/email/ses.ts` — NEW: SES client + `sendHtmlEmail()`
- `packages/shared/src/email/transactional.ts` — NEW: 10 named email send functions with pre-compiled Handlebars templates
- `packages/shared/src/email/index.ts` — NEW: barrel re-export
- `packages/shared/src/email/templates/welcome.html` — NEW
- `packages/shared/src/email/templates/platform-sub-started.html` — NEW
- `packages/shared/src/email/templates/platform-sub-canceled.html` — NEW
- `packages/shared/src/email/templates/author-sub-started-viewer.html` — NEW
- `packages/shared/src/email/templates/author-sub-canceled-viewer.html` — NEW
- `packages/shared/src/email/templates/author-sub-started-author.html` — NEW
- `packages/shared/src/email/templates/author-sub-canceled-author.html` — NEW
- `packages/shared/src/email/templates/connect-onboarding-complete.html` — NEW
- `packages/shared/src/email/templates/platform-new-subscriber.html` — NEW
- `packages/shared/src/email/templates/platform-feature-booked.html` — NEW
- `packages/shared/src/index.ts` — added `export * from './email/index.js'`
- `.github/workflows/_build-lambdas.yml` — added `--loader:.html=text` to esbuild `bundle()`
- `lambdas/auth-triggers/src/handler.ts` — import + fire `sendWelcomeEmail` after user records created
- `lambdas/subscriptions-webhook/src/handlers/subscription-events.ts` — imports + fire-and-forget email sends in `handleSubscriptionCreated` + `handleSubscriptionDeleted`
- `lambdas/subscriptions-webhook/src/handlers/account-events.ts` — imports + fire `sendConnectOnboardingCompleteEmail` on charges_enabled flip
- `lambdas/subscriptions-webhook/src/handlers/payment-intent-events.ts` — import + fire `sendPlatformFeatureBookedEmail` to admin on WEEKLY_FEATURE succeeded
- `infrastructure/stacks/auth-stack.ts` — `iam` import + `secretArn` helper + SES IAM policy + `APP_BASE_URL` env var on `auth-triggers`
- `infrastructure/stacks/api-stack.ts` — SES IAM policy + `SES_ADMIN_ADDRESS` env var on `subscriptions-webhook`

---

## Done when

- [x] 10 HTML Handlebars templates created with correct variable contracts
- [x] `packages/shared/src/email/` module complete: `html.d.ts`, `ses.ts`, `transactional.ts`, `index.ts`
- [x] `packages/shared/src/index.ts` exports email module
- [x] `_build-lambdas.yml` passes `--loader:.html=text` to esbuild
- [x] `auth-triggers` fires welcome email (fire-and-forget) after creating user records
- [x] `subscription-events.ts` fires correct emails from `handleSubscriptionCreated` and `handleSubscriptionDeleted` (platform + author variants; admin notified on PLATFORM created)
- [x] `account-events.ts` fires Connect onboarding email only on false→true `charges_enabled` transition
- [x] `payment-intent-events.ts` fires admin feature-booked email on `payment_intent.succeeded` (WEEKLY_FEATURE)
- [x] `auth-triggers` Lambda has `ses:SendEmail` + `secretsmanager:GetSecretValue` (ses from-address) IAM permissions in `auth-stack.ts`
- [x] `subscriptions-webhook` Lambda has `ses:SendEmail` + `secretsmanager:GetSecretValue` (ses from-address) + `SES_ADMIN_ADDRESS` env var in `api-stack.ts`
- [x] `npx tsc --noEmit` passes with zero errors across all lambda tsconfigs and the shared package
- [x] CDK `cdk synth --strict` passes with zero warnings (to verify at next deploy)
- [ ] Integration test: `auth-triggers` PostConfirmation → welcome email sent (spy on `sendHtmlEmail`)
- [ ] Integration test: `customer.subscription.created` PLATFORM → platform sub started email + admin notification fired
- [ ] Integration test: `customer.subscription.deleted` AUTHOR_SUB → viewer canceled email + author canceled email fired
- [ ] Integration test: `account.updated` charges_enabled false→true → onboarding complete email fired; second `account.updated` (already enabled) → no second email

---

## Tests to write

- **`lambdas/auth-triggers/src/__tests__/handler.integration.test.ts`** — extend with: mock `sendHtmlEmail` (vi.mock on ses module); assert it is called once with correct `to` and subject after PostConfirmation trigger.
- **`lambdas/subscriptions-webhook/src/__tests__/stripe-webhook.integration.test.ts`** — extend with: spy on all named send functions; assert correct call for each event type listed above; assert no email on `handleSubscriptionUpdated`/`handleSubscriptionPaused`/`handleSubscriptionResumed`; assert admin email on PLATFORM created; assert no admin email on AUTHOR_SUB created.
- **`lambdas/subscriptions-webhook/src/__tests__/account-events.test.ts`** — unit test: spy on `sendConnectOnboardingCompleteEmail`; assert called when charges_enabled flips false→true; assert NOT called when already true → true (idempotency).
