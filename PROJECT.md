# Duseum — Digital Museum Platform
### Project Master Document v1.3
> This document is the **single source of truth** for the Duseum platform. All architecture decisions, requirements, API contracts, infrastructure configurations, security policies, implementation plans, and project rules are defined here. AI coding assistants (Claude Code, Cursor, Copilot, etc.) must generate specs, implementation tasks, and code directly from this document. **Do not store project decisions anywhere else.**

---

## Table of Contents
1. [Project Overview](#1-project-overview)
2. [Functional Requirements](#2-functional-requirements)
3. [Non-Functional Requirements](#3-non-functional-requirements)
4. [System Architecture](#4-system-architecture)
5. [AWS Infrastructure & Resources](#5-aws-infrastructure--resources)
6. [Software Design](#6-software-design)
7. [Security Architecture](#7-security-architecture)
8. [API Documentation](#8-api-documentation)
9. [DevOps & Deployment](#9-devops--deployment)
10. [Project Configuration & Setup](#10-project-configuration--setup)
11. [Infrastructure Bootstrap Guide](#11-infrastructure-bootstrap-guide)
12. [Implementation Plan](#12-implementation-plan)
13. [Project Rules & AI-IDE Guidelines](#13-project-rules--ai-ide-guidelines)
14. [Infrastructure Cost Estimates](#14-infrastructure-cost-estimates)
15. [Testing Plan](#15-testing-plan)
16. [Local Development](#16-local-development)

---

## 1. Project Overview

### 1.1 What Is Duseum?

> **Portfolio Note**: Duseum is designed as a **portfolio project** demonstrating full-stack serverless engineering, AWS architecture, and DevOps skills across a creative, real-world domain. The architecture and feature depth are intentionally production-grade — not tutorial-grade. The platform is equally viable as an **MVP for a real startup**. The closest market comparables (DeviantArt, ArtStation, Behance) do not offer the tiered access model combining a platform subscription with direct author subscriptions under a unified museum metaphor — this is a defensible niche.

Duseum is a serverless, cloud-native online museum platform where users can discover and showcase original artwork. The platform operates on a **dual-profile model**: a **Viewer profile** for browsing and a **Author profile** for publishing. Access is gated by a layered subscription system that monetizes both platform-wide browsing and individual creator followings.

A single user account can hold both profiles simultaneously — a creator is also a viewer, and a viewer can become a creator at any time.

### 1.2 How It Works

```
VIEWER (Free)
  → Browses a curated free tier of public artwork (platform-defined limit)
  → Sees a subset of each Author's public gallery
  → Sees the Daily Featured Author and Weekly Featured Authors (free, no subscription needed)

VIEWER (Platform Subscriber)
  → Unlimited access to all public artwork from all Authors

VIEWER (Author Subscriber)
  → Pays a per-Author subscription fee
  → Gains access to that specific Author's private collection
  → Platform retains a cut of the Author subscription revenue

AUTHOR (Free)
  → Publishes artwork publicly or privately
  → Private pieces are hidden from all Viewers by default
  → Has a "Private Section" for pieces only Author-subscribers can see
  → Eligible to be randomly selected as the Daily Featured Author (free; no action required)

AUTHOR (Paid Weekly Feature)
  → Pays a one-time fee to be featured on the homepage for a full calendar week
  → Up to 10 Authors may be featured simultaneously per week
  → Authors book a specific future week on a first-come first-served basis
  → Limited to 1 paid weekly feature per 3-month rolling period per Author
```

### 1.3 Key Personas

| Persona | Description |
|---|---|
| **User (Account)** | Top-level account created at sign-up. Holds identity, credentials, and one or both profiles. |
| **Viewer Profile** | Automatically created on email verification. Allows browsing art. Access depth is determined by subscription tier. |
| **Author Profile** | Opt-in profile creation flow. Allows publishing, organizing, and monetizing artwork. Authors control public/private visibility per piece. |
| **Admin** | Platform-level role assigned directly to user accounts. Manages content moderation, subscription configuration, and platform settings. |

### 1.4 Access Tier Matrix

| Content | Free Viewer | Platform Subscriber | Author Subscriber | Author (own content) |
|---|---|---|---|---|
| Public art (free tier pieces) | ✅ | ✅ | ✅ | ✅ |
| Public art (beyond free tier) | ❌ | ✅ | ✅ | ✅ |
| Author's private section | ❌ | ❌ | ✅ | ✅ |
| Author's own drafts | ❌ | ❌ | ❌ | ✅ |

### 1.5 Revenue Model

- **Platform Subscription** — flat monthly fee granting unlimited public artwork access
- **Author Subscription** — per-author monthly fee set by the Author; platform takes a configurable cut (default: 10%)
- **Paid Weekly Feature** — one-time fee per booking for an Author to be featured on the homepage for a full calendar week (up to `WEEKLY_FEATURE_SLOT_COUNT` slots/week, default: 3; first-come first-served)
- Subscriptions are powered by Stripe Billing (recurring); Paid Weekly Feature is a Stripe one-time Payment Intent

### 1.6 Mission

To give artists a beautiful, museum-quality space to share their work — and to give art lovers a curated, meaningful way to discover and support creators directly.

---

## 2. Functional Requirements

### 2.1 Authentication & Identity

- **FR-AUTH-01**: Users register with email/password or OAuth (Google); registration creates a base `User` account with no profiles attached
- **FR-AUTH-02**: Email verification required before any profile is created or activated; upon verification, a **Viewer profile is automatically created and activated** — no additional setup required
- **FR-AUTH-03**: JWT-based session management using Amazon Cognito; access tokens (1hr TTL) + refresh tokens (30-day TTL with rotation)
- **FR-AUTH-04**: Cognito User Pool handles password policies, MFA (optional), and OAuth federation (Google)
- **FR-AUTH-05**: System-level roles: `USER`, `ADMIN`. Profile types are separate from roles (see FR-PROF-*)
- **FR-AUTH-06**: Password reset via Cognito hosted UI / custom email trigger (time-limited, single-use)
- **FR-AUTH-07**: Account suspension disables all profiles simultaneously; individual profiles can also be suspended independently

### 2.2 Profile System

- **FR-PROF-01**: On email verification, a `VIEWER` profile is automatically created. Users may additionally create an `AUTHOR` profile through a dedicated onboarding flow
- **FR-PROF-02**: Each profile has an independent lifecycle: `PENDING_SETUP` → `ACTIVE` → `SUSPENDED` → `DEACTIVATED`
- **FR-PROF-03**: A user can hold at most one Viewer profile and at most one Author profile
- **FR-PROF-04**: Suspending one profile does not affect the other profile
- **FR-PROF-05**: Viewer profile cannot be deactivated by the user — it is the baseline identity. Only an Admin can suspend it
- **FR-PROF-06**: Author profile can be deactivated by the user; deactivated Author profiles soft-hide all their artwork from public views; reactivation within 90 days restores all content

### 2.3 Viewer Profile Features

- **FR-VIEW-01**: Viewer profile is auto-created on email verification; no setup flow required
- **FR-VIEW-02**: Viewer dashboard shows: recent artwork feed (filtered by access tier), followed Authors' new uploads, Daily Featured Author spotlight, Weekly Featured Authors carousel, platform-curated trending pieces
- **FR-VIEW-03**: Free-tier Viewers see a platform-configured number of public pieces per Author (default: 10). Pieces beyond this limit show a "Subscribe to platform" upsell
- **FR-VIEW-04**: Platform Subscribers see unlimited public pieces from all Authors
- **FR-VIEW-05**: Author Subscribers see that Author's private section in addition to all public pieces
- **FR-VIEW-06**: Viewers can **follow** any Author; following surfaces their new public uploads in the Viewer's feed and opts them in to new-piece email notifications (subject to their notification preferences — see FR-NOTIF-*)
- **FR-VIEW-06a**: Viewers can **unfollow** any Author at any time; unfollowing immediately stops both feed surfacing and email notifications for that Author
- **FR-VIEW-07**: Viewers can react to and comment on artwork they have access to
- **FR-VIEW-08**: Viewer public profile page: display name, member since, number of Authors followed, number of comments/reactions (counts only)
- **FR-VIEW-09**: Viewers can manage their **notification preferences** per-Author and globally in their account settings. Per-Author preferences override the global default. Available settings: `ALL_NEW_PIECES` (default), `PUBLIC_ONLY`, `NONE`
- **FR-VIEW-10**: Viewers can globally opt out of all new-piece notification emails in a single action ("Unsubscribe from all new-piece notifications"); per-Author preferences are preserved but the global flag suppresses all delivery

### 2.4 Author Profile Features

- **FR-AUTH-PROF-01**: Author onboarding flow: display name, bio, profile photo, cover photo, and optional author subscription price (if they want to monetize their private section)
- **FR-AUTH-PROF-02**: Authors upload artwork as **Art Pieces** (see FR-ART-*)
- **FR-AUTH-PROF-03**: Authors organize Art Pieces into **Collections** (curated groups)
- **FR-AUTH-PROF-04**: Authors have a **Private Section** — a designated area for art pieces visible only to Author Subscribers
- **FR-AUTH-PROF-05**: Authors set their **author subscription price** (min: $1/month, max: $50/month) or disable author subscriptions entirely (private section remains hidden from all)
- **FR-AUTH-PROF-06**: Author dashboard shows: total views, follower count, subscriber count, revenue (current month, all-time), recent comments on their pieces, upcoming weekly feature booking (if any), past feature history
- **FR-AUTH-PROF-07**: Author public profile page: bio, cover photo, public gallery, collections list, subscription CTA if private section is enabled
- **FR-AUTH-PROF-08**: Authors can pin up to 3 pieces to the top of their public gallery
- **FR-AUTH-PROF-09**: Authors can enable/disable comments per piece

### 2.5 Art Piece Management

- **FR-ART-01**: Authors upload art pieces with: title (required), description (optional, max 2,000 chars), medium/category tag, upload date, visibility setting, and an image file
- **FR-ART-02**: Visibility settings: `PUBLIC` (all viewers based on tier), `PRIVATE` (Author Subscribers only), `DRAFT` (Author-only, not visible to anyone)
- **FR-ART-03**: Supported file types: JPEG, PNG, WEBP, GIF (static). Max file size: 20MB
- **FR-ART-04**: On upload, images are stored in S3 and served via CloudFront CDN
- **FR-ART-05**: Art piece lifecycle: `DRAFT` → `PUBLISHED` (PUBLIC or PRIVATE) → `ARCHIVED`
- **FR-ART-06**: Authors can edit title, description, tags, and visibility at any time (excluding archived pieces)
- **FR-ART-07**: Authors can archive (soft-delete) a piece; archived pieces are not visible to any viewer but remain in the Author's dashboard
- **FR-ART-08**: Authors can permanently delete a piece (removes S3 object and all records; irreversible)
- **FR-ART-09**: Art pieces support **tags** (up to 10 per piece; free-text, normalized to lowercase)
- **FR-ART-10**: Art pieces track: view count, reaction count by type, comment count
- **FR-ART-11**: Authors can retrieve all their own art pieces (PUBLIC, PRIVATE, DRAFT) via an authenticated `GET /artworks/mine` endpoint. This is separate from the public `GET /artworks` endpoint which only returns PUBLIC pieces visible to the caller based on tier access.

### 2.6 Collections

- **FR-COL-01**: Authors create named collections (title, description, cover piece) to group their Art Pieces
- **FR-COL-02**: A collection can contain any of the Author's art pieces regardless of piece visibility (`PUBLIC`, `PRIVATE`, or `DRAFT`). Viewers see individual pieces within a collection according to each piece's own access rules — private pieces remain gated by Author Subscription even inside a FREE collection.
- **FR-COL-03**: Collections have their own visibility: `FREE` (visible to all viewers on the Author's profile) or `SUBSCRIBER_ONLY` (visible only to Author Subscribers). Collection visibility is **immutable after creation** — it cannot be changed once set. This prevents a `SUBSCRIBER_ONLY` collection from being flipped to `FREE` and inadvertently surfacing gated content.
- **FR-COL-04**: Authors set the display order of pieces within a collection
- **FR-COL-05**: A piece can belong to multiple collections
- **FR-COL-06**: Collections display a piece count adjusted to the viewer's access tier (e.g., "12 pieces — 4 visible to you")
- **FR-COL-07**: Collections have an optional **poster image** (`posterS3Key`). Authors upload the poster via the `POST /media/upload-intent` flow when creating or editing a collection in their dashboard. The resolved `posterUrl` (CloudFront URL) is returned in all API responses that list collections (`GET /authors/{id}/collections`, `GET /features/homepage`, `GET /collections`). Frontend falls back to the first-piece thumbnail when `posterUrl` is absent, then to a branded placeholder. Poster images are stored in S3 and served via CloudFront under the same rules as all other author media.
- **FR-COL-08**: A dedicated **`/collections/:collectionId`** frontend page displays all pieces within a collection. FREE collections are fully visible to any viewer (individual piece access rules per FR-COL-02 still apply). SUBSCRIBER_ONLY collections gate the pieces list: authenticated active subscribers to the collection's author see the pieces; unauthenticated users and authenticated non-subscribers see a gate UI displaying the collection title, description, and author name with a CTA linking to the author's profile (`/authors/:ownerId`) to subscribe. The `GET /collections/:collectionId` backend response always returns an `access` field (`'GRANTED'` | `'SUBSCRIBER_ONLY_GATED'` | `'AUTH_REQUIRED'`) alongside collection metadata even when pieces are withheld, so the frontend can render the gate UI without a second API call. Collection cards on the Author Profile page link to this route.

### 2.7 Subscriptions & Payments

- **FR-SUB-01**: Platform Subscription is managed via Stripe Billing; price is set by platform Admins in Stripe and referenced by price ID in app config
- **FR-SUB-02**: Author Subscription is a per-Author Stripe Billing subscription; each Author has their own Stripe Price object
- **FR-SUB-03**: Subscription state is stored in the database and kept in sync via Stripe webhooks (`customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`)
- **FR-SUB-04**: On successful subscription to an Author, Viewer immediately gains access to that Author's private section
- **FR-SUB-05**: On subscription cancellation or payment failure, access to private section is revoked at the end of the billing period (Stripe handles grace period)
- **FR-SUB-06**: Platform takes a configurable revenue cut from Author subscriptions (default: 20%); implemented via Stripe Connect application fee
- **FR-SUB-07**: Authors must connect a Stripe account (via Stripe Connect Express) before enabling Author subscriptions
- **FR-SUB-08**: Authors can view subscription analytics: active subscriber count, monthly recurring revenue (MRR), churn rate
- **FR-SUB-09**: Viewers can manage their subscriptions (cancel, update payment method) via a self-service portal (Stripe Billing Portal)
- **FR-SUB-10**: Free-tier limits (pieces per Author visible to free viewers) are configurable by Admins without a code deploy (stored in SSM Parameter Store)
- **FR-SUB-11**: After completing Stripe Connect Express onboarding, the Author is redirected to `/dashboard/author?connect=return`. The frontend must detect this query param, display a success notification, and invalidate the connect-status cache so the UI immediately reflects `chargesEnabled: true` without a page reload.
- **FR-SUB-12**: If the Stripe Connect onboarding link expires before the Author completes onboarding, Stripe redirects to `/dashboard/author?connect=refresh`. The frontend must detect this param, automatically call `POST /subscriptions/connect/onboard` to obtain a fresh link, and redirect the Author back to Stripe without requiring manual interaction.
- **FR-SUB-13**: Stripe fires `account.updated` on the platform webhook when a connected Express account's `charges_enabled` or `payouts_enabled` state changes. The `subscriptions-webhook-lambda` must handle this event by updating the Author's DynamoDB record with the current `connectChargesEnabled` boolean, so that `GET /subscriptions/connect/status` can read from DynamoDB first and only fall back to a live Stripe API call when the cached value is absent.
- **FR-SUB-14**: Authors can open their Stripe Express Dashboard from the Author Analytics tab to view income, payouts, and download statements. A new `POST /subscriptions/connect/login-link` route calls `stripe.accounts.createLoginLink()` and returns a one-time URL; the frontend redirects the author on button click. The button is only rendered when `connectChargesEnabled: true`; authors with incomplete Connect onboarding see a contextual note instead.

### 2.8 Discovery & Browse

- **FR-DISC-01**: Public homepage shows: **Daily Featured Author** (randomly selected by the platform each day, free), **Weekly Featured Authors** (up to 10 paid slots, rotates every Monday), recently published pieces (paginated). *(Trending pieces deferred — requires trendScore GSI not yet provisioned.)*
- **FR-DISC-02**: Browse page with filters: category/medium, tags, sort (`newest` only in v1). *(sort=trending and sort=most-viewed deferred — require trendScore/viewCount GSIs.)*
- **FR-DISC-03**: Search deferred to a future phase. *(Full-text search requires OpenSearch or a scan-based approach that conflicts with the no-full-scan rule.)*
- **FR-DISC-04**: Author directory: paginated list of all Authors, sortable by subscriber count and newest
- **FR-DISC-05**: Piece detail page: full-resolution image (CloudFront-served), metadata, Author info, reactions. *(Comment thread and related pieces on detail page deferred — add in frontend integration phase.)*
- **FR-DISC-06**: The public homepage displays an **"Explore Collections"** section showing up to 6 randomly sampled FREE collections from across all authors. Each card displays the poster image (FR-COL-07 fallback rules apply), collection title, author display name, and piece count. Collections are sampled in Lambda memory from `GSI-AllFreeCollections` and returned as part of the `GET /features/homepage` response payload. No auth required.
- **FR-DISC-07**: A dedicated **`/browse/collections`** frontend page and corresponding `GET /collections` backend route list all FREE collections from all authors, cursor-paginated (default limit: 20, max: 50), sorted by newest. Each collection card displays poster image, title, author display name, and piece count. Backend route lives in `artworks-lambda` and uses `GSI-AllFreeCollections`. *(sort=trending and sort=most-interacted deferred — require an interaction-count GSI not yet provisioned.)*
- **FR-DISC-08**: The `/browse` route renders a **Browse Atrium** landing page with three navigable lane-cards: **Art Pieces** (→ `/browse/pieces`), **Authors** (→ `/authors`), **Collections** (→ `/browse/collections`). Each lane is a dedicated page link — no tabs. The existing artworks browse page moves from `/browse` to `/browse/pieces`; all internal links updated accordingly. The NavBar Browse link continues to point to `/browse` (the Atrium). The Atrium is public, no auth required.

### 2.9 Social Interactions

- **FR-SOC-01**: Viewers can react to art pieces with one of: `LOVE`, `WOW`, `FIRE`, `INSPIRED` (one reaction per user per piece; changing reaction replaces previous). Reaction counts and the authenticated viewer's current reaction (`viewerReaction`) are returned as part of `GET /artworks/{artworkId}` — there is no separate reactions read endpoint. Access is enforced at the artwork read layer; `PUT`/`DELETE /artworks/{artworkId}/reactions` only verify the piece exists.
- **FR-SOC-02**: Viewers can comment on art pieces (Author can disable comments per piece); max 1,000 chars per comment
- **FR-SOC-03**: Authors can reply to comments; one level of nesting only (no nested replies to replies)
- **FR-SOC-04**: Authors can pin/unpin comments on their pieces (up to 2 pinned per piece)
- **FR-SOC-05**: Authors and Admins can delete/hide comments
- **FR-SOC-06**: Viewers can follow Authors; followers receive new-piece notifications via in-app feed and email (subject to notification preferences — see FR-NOTIF-*)

### 2.10 Admin Capabilities

- **FR-ADMIN-01**: Admins can view all users, profiles, art pieces, and subscriptions
- **FR-ADMIN-02**: Admins can suspend/reinstate user accounts and individual profiles
- **FR-ADMIN-03**: Admins can remove art pieces and comments that violate platform policies
- **FR-ADMIN-04**: Admins can manually override the Daily Featured Author selection (e.g., to substitute an Author if the selected Author has violated policies); override is logged
- **FR-ADMIN-05**: Admins can configure platform-level settings: free-tier piece limit, platform subscription price ID (Stripe), platform revenue cut percentage, weekly feature fee, weekly feature slot count (default: 3) — all stored in SSM Parameter Store
- **FR-ADMIN-06**: Admin dashboard shows: total users, active subscriptions (platform + author), MRR, new signups (7d/30d), flagged content queue, upcoming weekly feature bookings by week, weekly feature revenue (current month)
- **FR-ADMIN-07**: Admins can cancel a paid weekly feature booking and issue a full refund (e.g., if an Author violates platform policies); the freed slot becomes available for re-booking

### 2.11 Featured Authors

#### Daily Featured Author (Free)

- **FR-FEAT-01**: Each calendar day, the platform automatically selects **one Author** as the Daily Featured Author. Selection is random among all Authors with an `ACTIVE` profile and at least one `PUBLIC` published art piece
- **FR-FEAT-02**: The Daily Featured Author is displayed prominently on the homepage (hero/spotlight placement) and is visible to all users — authenticated or not, free tier or subscribed
- **FR-FEAT-03**: Daily Featured Author selection runs via an EventBridge scheduled rule at 00:00 UTC. The `maintenance-lambda` executes the selection and writes the result to the config table (`DAILY_FEATURED_AUTHOR`)
- **FR-FEAT-04**: Authors are not notified when selected as Daily Featured Author (keeps the mechanic lightweight and surprise-based; may be revisited in v2)
- **FR-FEAT-05**: The same Author cannot be selected as Daily Featured Author on consecutive days. The last 7 daily selections are stored and excluded from the random pool
- **FR-FEAT-06**: Admins can manually override the Daily Featured Author for any day via the admin panel. Overrides are logged with timestamp and admin userId. An overridden day does not count toward FR-FEAT-05's exclusion window
- **FR-FEAT-07**: The Daily Featured Author spotlight displays: Author display name, bio excerpt, cover photo, up to 3 pinned art pieces, follower count, and a "Follow" / "Subscribe" CTA

#### Weekly Featured Authors (Paid)

- **FR-FEAT-08**: The homepage displays a **Weekly Featured Authors** section showing up to **`WEEKLY_FEATURE_SLOT_COUNT` Authors** (default: 3, admin-configurable) for the current calendar week (Monday 00:00 UTC → Sunday 23:59 UTC). The frontend reads `slotsTotal` from the API response — never hardcodes a slot count
- **FR-FEAT-09**: Authors pay a **one-time flat fee** (configurable by Admins; default: $25/week) to book a weekly feature slot. Payment is a Stripe Payment Intent (not a recurring subscription)
- **FR-FEAT-10**: Weekly feature slots are sold on a **first-come first-served** basis. Each week has exactly `WEEKLY_FEATURE_SLOT_COUNT` slots (default: 3, admin-configurable). Authors book a specific week (current or future) from the available calendar; weeks where all slots are already taken are shown as unavailable
- **FR-FEAT-11**: An Author may only hold **one paid weekly feature booking per 3-month rolling period**. The 3-month window is calculated from the start of the booked week, looking back 3 calendar months. This limit is enforced at booking time; attempting to book a second slot within the window returns a `409 Conflict`
- **FR-FEAT-12**: Booking flow: Author selects an available week → platform checks eligibility (FR-FEAT-11) and slot availability (FR-FEAT-10) → Stripe Payment Intent created → Author completes payment → on `payment_intent.succeeded`: if the booking is for the **current ISO week** the status immediately transitions to `ACTIVE` (with `activatedAt`); if for a **future week** it transitions to `CONFIRMED` and waits for the Monday rotation (FR-FEAT-15). If payment fails, booking is set to `CANCELLED` — no slot is reserved
- **FR-FEAT-13**: Confirmed bookings are **non-refundable** unless cancelled by an Admin (FR-ADMIN-07). Authors may not cancel their own bookings
- **FR-FEAT-14**: The booking calendar shows the **current week plus up to `WEEKLY_FEATURE_ADVANCE_WEEKS` future weeks** (default: 3 advance weeks, admin-configurable). Booking the current week is allowed **Monday–Saturday (UTC)**. On **Sundays (UTC)** the current week is excluded from the calendar — it has fewer than 24 hours remaining and would give the Author almost no featured time. This Sunday block is enforced in `getEligibleWeeks()` in `packages/shared/src/features/` and propagates automatically to the availability endpoint and the booking validator.
- **FR-FEAT-15**: Weekly Featured Authors rotate automatically at Monday 00:00 UTC via EventBridge. The `maintenance-lambda` runs three steps in order: (1) promote `CONFIRMED`→`ACTIVE` for all current-week bookings (sets `activatedAt`); (2) archive `ACTIVE`→`ARCHIVED` for all previous-week bookings; (3) safety-net: archive any remaining `CONFIRMED` bookings for the previous week (handles the rare case where payment was confirmed after Monday 00:00 UTC, missing last week's rotation)
- **FR-FEAT-16**: The weekly feature section displays each featured Author's: display name, cover photo, a sample of their latest 2 public pieces, and a "View Profile" link. Order within the section is randomized each page load to avoid positional advantage
- **FR-FEAT-17**: Stripe webhook events for the weekly feature Payment Intent (`payment_intent.succeeded`, `payment_intent.payment_failed`) are processed by `subscriptions-webhook-lambda` using the same idempotency pattern as subscription webhooks. `payment_intent.succeeded` branches on ISO week: current week → booking immediately `ACTIVE` + `activatedAt` set; future week → booking `CONFIRMED` (awaits Monday rotation). `payment_intent.payment_failed` → booking `CANCELLED` with `cancelledBy=STRIPE_PAYMENT_FAILED`
- **FR-FEAT-18**: Authors can view their upcoming and past weekly feature history in their Author dashboard, including payment receipts

---

### 2.12 Notifications

- **FR-NOTIF-01**: When an Author publishes a new art piece (transitions from `DRAFT` to `PUBLISHED`, or creates a piece directly as `PUBLIC` or `PRIVATE`), a **new-piece notification** is dispatched to all Viewers who follow that Author
- **FR-NOTIF-02**: Notification dispatch is **asynchronous** — publishing an art piece returns immediately to the Author; fan-out to followers happens via SQS → `notifications-lambda` and does not block the `POST /artworks` response
- **FR-NOTIF-03**: Notifications are delivered by **email via AWS SES**. Each notified Viewer receives one email per new piece, sent from `no-reply@duseum.com`
- **FR-NOTIF-04**: The notification email contains: Author display name, art piece title, thumbnail image (inline or linked), a short excerpt of the piece description (max 160 chars), piece visibility label ("New public piece" / "New exclusive piece for subscribers"), and a deep link to the piece detail page
- **FR-NOTIF-05**: **PRIVATE** pieces trigger notifications only to Viewers who are **Author Subscribers** of that Author. Free followers do not receive email notifications for private pieces (they cannot access the content anyway)
- **FR-NOTIF-06**: **PUBLIC** pieces trigger notifications to **all followers** of that Author regardless of subscription tier
- **FR-NOTIF-07**: Notification dispatch respects each Viewer's **notification preferences** (FR-VIEW-09, FR-VIEW-10):
  - `ALL_NEW_PIECES` (default) — notify on all PUBLIC and PRIVATE (if subscribed) pieces
  - `PUBLIC_ONLY` — notify only on PUBLIC pieces; suppress PRIVATE piece emails even if subscribed
  - `NONE` — suppress all emails from this Author
  - Global opt-out flag (FR-VIEW-10) — suppresses delivery regardless of per-Author setting
- **FR-NOTIF-08**: Each notification email includes a **one-click unsubscribe link** (CAN-SPAM / GDPR compliance). Clicking it sets that Author's per-Viewer preference to `NONE` without requiring login. The unsubscribe token is a signed, time-limited JWT (TTL: 30 days)
- **FR-NOTIF-09**: Notification fan-out is **batched** when an Author has many followers: the `artworks-lambda` publishes a single `NEW_PIECE_PUBLISHED` message to the notification SQS queue; `notifications-lambda` queries followers in pages and sends individual SES emails. This prevents `artworks-lambda` from holding a DynamoDB connection open during large fan-outs
- **FR-NOTIF-10**: If SES delivery fails for an individual Viewer (e.g., bounced email), the failure is logged and counted but does not cause the entire batch to retry — other followers still receive their emails
- **FR-NOTIF-11**: Notification emails are **not sent** for:
  - Pieces published with `DRAFT` visibility (drafts are never announced)
  - Visibility changes after initial publish (e.g., changing a piece from `PUBLIC` to `PRIVATE` after the fact does not generate a second notification)
  - Pieces published by an Author whose profile is `SUSPENDED` or `DEACTIVATED`
- **FR-NOTIF-12**: Authors can see a **notification delivery summary** in their Author dashboard: "X followers notified" count shown on each published piece (updated asynchronously as fan-out completes; not a real-time count)

---

## 3. Non-Functional Requirements

### 3.1 Performance

- **NFR-PERF-01**: Public gallery pages (homepage, browse, Author profile) must load in < 2s P95 under normal load
- **NFR-PERF-02**: Art piece image delivery via CloudFront CDN; image response time < 200ms P95 globally
- **NFR-PERF-03**: Lambda cold start budget: < 1s for all Lambda functions (enforced via provisioned concurrency on critical paths and lean bundles via esbuild)
- **NFR-PERF-04**: API response time < 500ms P95 for all read endpoints; < 1s P95 for write endpoints
- **NFR-PERF-05**: Pagination enforced on all list endpoints (max page size: 50 items)

### 3.2 Scalability

- **NFR-SCALE-01**: Architecture scales to 0 at zero traffic (Lambda + DynamoDB on-demand) — no idle compute cost
- **NFR-SCALE-02**: No single Lambda function handles more than one domain (auth, artwork, subscriptions, users); each scales independently
- **NFR-SCALE-03**: S3 + CloudFront image delivery is infinitely scalable without application-layer changes

### 3.3 Security

- **NFR-SEC-01**: All API endpoints require a valid Cognito JWT except explicitly public read endpoints
- **NFR-SEC-02**: Access tier enforcement happens at the Lambda layer, not just at the frontend
- **NFR-SEC-03**: Stripe webhook signatures verified on every inbound webhook event
- **NFR-SEC-04**: S3 bucket for media is not publicly accessible; all reads go through CloudFront with signed URLs for private content
- **NFR-SEC-05**: All secrets (Stripe keys, DB credentials, JWT config) stored in AWS Secrets Manager; never in environment variables or code
- **NFR-SEC-06**: WAF **intentionally disabled** (cost optimisation — ~$8–10/month saved). CloudFront distributions have no WAF WebACL attached. Remaining protections: HTTPS enforcement, TLS 1.2 minimum, SecurityHeaders response policy on the SPA distribution, Cognito JWT authorizer on API routes, and API Gateway stage-level throttling. WAF can be re-enabled by reverting `CdnStack` to the previous `CfnWebACL` implementation.
- **NFR-SEC-07**: Private art pieces served via CloudFront signed URLs (TTL: 1 hour); URL signing happens in Lambda, not frontend

### 3.4 Reliability

- **NFR-REL-01**: Stripe webhook processing is idempotent — processing the same event twice produces the same result
- **NFR-REL-02**: All Stripe webhooks are queued via SQS before processing; failed events land in a DLQ with alerting
- **NFR-REL-03**: DynamoDB on-demand mode; no capacity planning required for v1
- **NFR-REL-04**: Lambda functions have structured retry logic (SQS-triggered functions retry up to 3 times before DLQ)

### 3.5 Observability

- **NFR-OBS-01**: All Lambda functions emit structured JSON logs to CloudWatch
- **NFR-OBS-02**: CloudWatch alarms on: Lambda error rate > 1%, SQS DLQ message count > 0, API Gateway 5xx rate > 1%
- **NFR-OBS-03**: X-Ray tracing enabled on all Lambda functions and API Gateway
- **NFR-OBS-04**: CloudWatch Dashboard showing: API request volume, error rates, Lambda durations, DynamoDB consumed capacity

### 3.6 Cost Efficiency

- **NFR-COST-01**: All compute is Lambda (pay-per-invocation); no ECS/EC2 costs at zero traffic
- **NFR-COST-02**: DynamoDB on-demand billing; no reserved capacity in v1
- **NFR-COST-03**: CloudFront caching minimizes S3 GET costs for frequently accessed art pieces

---

## 4. System Architecture

### 4.1 Architecture Overview

Duseum is a fully serverless application on AWS. There is no always-on compute — all request handling is done by Lambda functions invoked via API Gateway. The frontend is a React SPA hosted on S3 + CloudFront.

```
                     ┌─────────────────────────────────────────────┐
                     │               End Users (Browser)            │
                     └───────────────────┬─────────────────────────┘
                                         │ HTTPS
                         ┌───────────────▼─────────────────┐
                         │      CloudFront (CDN + WAF)      │
                         │  duseum.com (SPA assets)      │
                         │  api.duseum.com (API Gateway) │
                         │  media.duseum.com (images)    │
                         └──┬────────────┬────────────┬─────┘
                            │            │            │
               ┌────────────▼──┐   ┌─────▼──────┐  ┌▼──────────────────┐
               │ S3 SPA Bucket │   │API Gateway │  │ S3 Media Bucket   │
               │ (React build) │   │(HTTP API)  │  │ (art images)      │
               └───────────────┘   └─────┬──────┘  └───────────────────┘
                                         │ Lambda Proxy Integration
              ┌──────────────────────────┼──────────────────────────────┐
              │              Lambda Functions (per route group)          │
              ├──────────────┬───────────┬──────────┬───────────────────┤
              │  auth-lambda │artworks-  │users-    │ subscriptions-    │
              │  (Cognito    │lambda     │lambda    │ lambda            │
              │   triggers)  │           │          │ (Stripe)          │
              └──────┬───────┴─────┬─────┴────┬─────┴──────┬────────────┘
                     │             │          │            │
              ┌──────▼─────────────▼──────────▼────────────▼────────────┐
              │                    DynamoDB Tables                        │
              │  Users | Profiles | ArtPieces | Collections | Subscriptions│
              │  Comments | Reactions | Follows | WeeklyFeatureBookings  │
              │  DailyFeatureLog                                          │
              └───────────────────────────────────────────────────────────┘

              ┌──────────────────────────────────────────────────────────┐
              │                Async / Event-Driven Layer                 │
              │  Stripe Webhook → SQS → subscriptions-webhook-lambda     │
              │    (subscription events + weekly feature PaymentIntent)  │
              │  artworks-lambda → SQS (notification queue)              │
              │    → notifications-lambda → SES (follower email fan-out) │
              │  EventBridge daily 00:00 UTC  → maintenance-lambda       │
              │    (select Daily Featured Author)                         │
              │  EventBridge Monday 00:00 UTC → maintenance-lambda       │
              │    (rotate Weekly Featured Authors)                       │
              └──────────────────────────────────────────────────────────┘

              ┌──────────────────────────────────────────────────────────┐
              │                    AWS Cognito                            │
              │  User Pool (auth, JWT issuance, OAuth federation)        │
              │  Post-confirmation trigger → users-lambda (profile init) │
              └──────────────────────────────────────────────────────────┘
```

### 4.2 Lambda Function Inventory

Each Lambda function handles a cohesive route group. Functions are **thin handlers** — business logic lives in shared TypeScript modules imported by each Lambda.

| Lambda | Route Group | Trigger | Key Responsibilities |
|---|---|---|---|
| `artworks-lambda` | `GET/POST/PUT/DELETE /artworks/*` | API GW | Art piece CRUD, image upload presigned URL generation, access tier enforcement; on publish → enqueues `NEW_PIECE_PUBLISHED` message to notification SQS queue |
| `users-lambda` | `GET/PUT /users/*`, `/profiles/*` | API GW | User profile CRUD, Author onboarding, follow/unfollow, notification preference management |
| `subscriptions-lambda` | `GET/POST /subscriptions/*` | API GW | Subscription status reads, Stripe checkout session creation, Stripe billing portal |
| `subscriptions-webhook-lambda` | — | SQS (from Stripe webhook SQS queue) | Process Stripe subscription events AND weekly feature Payment Intent events; update state in DynamoDB; idempotent via idempotency table |
| `notifications-lambda` | — | SQS (from notification queue) | Fan-out new-piece email notifications to followers via SES; pages through Follow records; respects per-Viewer notification preferences and global opt-out; logs delivery summary count back to DynamoDB |
| `features-lambda` | `GET /features/*`, `POST /features/weekly/book` | API GW | Read Daily Featured Author; read current/upcoming Weekly Featured Authors; book a weekly feature slot (eligibility check + Stripe Payment Intent creation) |
| `social-lambda` | `/comments/*`, `PUT /artworks/*/reactions`, `DELETE /artworks/*/reactions` | API GW | Comments and reactions CRUD |
| `admin-lambda` | `/admin/*` | API GW | Admin operations (requires ADMIN Cognito group) |
| `auth-triggers-lambda` | — | Cognito Post-Confirmation trigger | Auto-create Viewer profile on email verification |
| `media-lambda` | `POST /media/upload-intent` | API GW | Generate S3 presigned PUT URLs for art piece uploads; confirm upload |
| `maintenance-lambda` | — | EventBridge (scheduled, two rules) | **Daily 00:00 UTC**: select Daily Featured Author (random eligible Author, exclude last 7); **Monday 00:00 UTC**: rotate Weekly Featured Authors (activate upcoming week's bookings, archive previous); also: cleanup expired upload intents, sync view/reaction counts |

### 4.3 Request Flow — Art Piece Upload

```
1. Author → POST /media/upload-intent
   Body: { fileName: "painting.jpg", mimeType: "image/jpeg", sizeBytes: 4096000 }

2. media-lambda:
   - Validates JWT → must be Author profile
   - Validates mimeType (allowlist) + sizeBytes (≤ 20MB)
   - Generates s3Key = UUID
   - Generates S3 presigned PUT URL (10-min TTL)
   - Writes UploadIntent to DynamoDB (status: PENDING)
   - Returns: { intentId, uploadUrl, s3Key, expiresAt }

3. Frontend → PUT {uploadUrl}   ← DIRECT to S3, NOT through Lambda
   Headers: Content-Type: image/jpeg
   Body: raw file bytes

4. Author → POST /artworks  (or PUT /artworks/{id})
   Body: { title, description, tags, visibility, s3Key }

5. artworks-lambda:
   - Validates s3Key exists in DynamoDB UploadIntents (status: PENDING, not expired)
   - Calls S3 HeadObject to confirm object exists and get authoritative sizeBytes
   - Creates ArtPiece record in DynamoDB (status: DRAFT or PUBLISHED per visibility)
   - Marks UploadIntent as CONSUMED
   - Returns: { artPieceId, mediaUrl }
```

### 4.4 Request Flow — Private Art Piece Access

```
1. Viewer → GET /artworks/{id}
   Headers: Authorization: Bearer {cognitoJWT}

2. artworks-lambda:
   - Validates JWT
   - Loads ArtPiece from DynamoDB
   - Determines access:
     a. visibility = PUBLIC + within free tier limit → serve public CloudFront URL
     b. visibility = PUBLIC + viewer is platform subscriber → serve public CloudFront URL
     c. visibility = PRIVATE + viewer is author subscriber → generate CloudFront signed URL (1hr TTL)
     d. visibility = PRIVATE + viewer is NOT author subscriber → 402 Payment Required
     e. visibility = DRAFT + caller is the Author → serve (author's own draft)
     f. Any other case → 403 Forbidden

3. For private pieces:
   - Lambda signs CloudFront URL using CloudFront key pair (stored in Secrets Manager)
   - Returns signed URL with 1hr expiry
   - Frontend uses this URL directly to render image
```

### 4.5 Request Flow — Stripe Webhook Processing

```
1. Stripe → POST /webhooks/stripe
   (API Gateway endpoint; no JWT required)

2. API Gateway → directly enqueues to SQS (no Lambda in the hot path for webhook receipt)
   - API GW mapping template validates Stripe-Signature header before enqueuing
   - Returns 200 immediately to Stripe

3. SQS → triggers subscriptions-webhook-lambda (batch size: 1, visibility timeout: 60s)

4. subscriptions-webhook-lambda:
   - Constructs raw body from SQS message
   - Verifies Stripe webhook signature (Stripe SDK constructEvent)
   - Reads eventId from Stripe event; checks DynamoDB idempotency table
   - If already processed → return success (idempotent)
   - Routes event type to handler:
     customer.subscription.created   → create/update Subscription record
     customer.subscription.updated   → update Subscription record (status, period_end)
     customer.subscription.deleted   → mark Subscription CANCELLED
     invoice.payment_failed          → mark Subscription PAST_DUE
   - Writes eventId to idempotency table (TTL: 7 days)
   - On failure → message returns to SQS for retry (up to 3x); then DLQ + CloudWatch alarm
```

### 4.6 Request Flow — New-Piece Notification Fan-Out

```
1. Author → POST /artworks  (visibility: PUBLIC or PRIVATE)

2. artworks-lambda:
   - Creates ArtPiece record in DynamoDB (status: PUBLISHED)
   - Publishes ONE message to the notification SQS queue:
     {
       "eventType": "NEW_PIECE_PUBLISHED",
       "artworkId": "uuid",
       "authorId": "uuid",
       "visibility": "PUBLIC",          // PUBLIC | PRIVATE
       "title": "Midnight Garden",
       "descriptionExcerpt": "An exploration of...",
       "thumbnailS3Key": "3f7a1b2c-...",
       "publishedAt": "2025-08-05T10:00:00Z"
     }
   - Returns { artPieceId, mediaUrl } to Author immediately
     (notification fan-out does NOT block this response)

3. SQS → triggers notifications-lambda (batch size: 1)

4. notifications-lambda:
   a. Loads ArtPiece + Author profile from DynamoDB (verify still PUBLISHED + Author ACTIVE)
   b. If visibility = PRIVATE:
      - Queries ONLY Author Subscribers (GSI-SubscribersByAuthor for this authorId)
      - Intersects with Follow records to get users who are both followers AND subscribers
        (subscribers who don't follow still receive notification — they paid; followers
         who don't subscribe do NOT receive notification for private pieces)
      Actually: notifies all ACTIVE Author Subscribers regardless of follow status,
      since they have paid access and opted in financially
   c. If visibility = PUBLIC:
      - Queries ALL Follow records for this authorId (GSI-FollowersByAuthor)
   d. For each recipient, checks notification preferences:
      - Loads Viewer profile → notificationPreferences
      - If global opt-out = true → skip
      - If per-author preference = NONE → skip
      - If per-author preference = PUBLIC_ONLY and visibility = PRIVATE → skip
      - Otherwise → add to SES send batch
   e. Sends emails in batches of 50 via SES SendBulkEmail API
      - Each email is personalised: recipient name, author name, piece title,
        thumbnail URL (CloudFront public URL for PUBLIC; omitted for PRIVATE),
        piece URL, one-click unsubscribe link
   f. Logs delivery count back to ArtPiece record:
      DynamoDB UpdateItem: notifiedCount += successCount
   g. On partial SES failure: log failed addresses; do not re-queue the whole job —
      successfully sent emails must not be re-sent (no idempotency token per recipient
      needed; fan-out is fire-and-forget per-recipient)
   h. On total failure (e.g., DynamoDB read fails): SQS visibility timeout expires →
      message retries (up to 3x) → DLQ + CloudWatch alarm
```

### 4.7 DynamoDB Table Design

Duseum uses a **single-table design** pattern with a main `duseum-{env}` table plus a few purpose-specific tables. All primary access patterns are defined below and drive the GSI/LSI design.

#### Main Table: `duseum-{env}`

**Access Patterns → Key Design:**

| Entity | PK | SK | Notes |
|---|---|---|---|
| User | `USER#{userId}` | `PROFILE` | Base user account |
| Viewer Profile | `USER#{userId}` | `PROFILE#VIEWER` | Viewer profile data |
| Author Profile | `USER#{userId}` | `PROFILE#AUTHOR` | Author profile data |
| Art Piece | `ARTWORK#{artworkId}` | `METADATA` | Piece metadata |
| Art Piece by Author | `AUTHOR#{authorId}` | `ARTWORK#{createdAt}#{artworkId}` | Query all pieces by Author |
| Collection | `COLLECTION#{collectionId}` | `METADATA` | Collection metadata |
| Collection Item | `COLLECTION#{collectionId}` | `ARTWORK#{order}#{artworkId}` | Pieces in a collection |
| Comment | `ARTWORK#{artworkId}` | `COMMENT#{createdAt}#{commentId}` | Comments on a piece |
| Reaction | `ARTWORK#{artworkId}` | `REACTION#{userId}` | One reaction per user per piece |
| Follow | `USER#{viewerId}` | `FOLLOW#AUTHOR#{authorId}` | Viewer follows Author |
| Notification Preference | `USER#{viewerId}` | `NOTIF_PREF#AUTHOR#{authorId}` | Per-Author notification preference override; absent = use global default |
| Platform Subscription | `USER#{userId}` | `SUB#PLATFORM` | Platform subscription state |
| Author Subscription | `USER#{userId}` | `SUB#AUTHOR#{authorId}` | Per-Author subscription state |
| Upload Intent | `UPLOAD#{intentId}` | `METADATA` | Short-lived upload tracking |
| Weekly Feature Booking | `FEATURE#WEEK#{isoWeek}` | `AUTHOR#{authorId}` | One booking per Author per week slot; `isoWeek` = `YYYY-Www` (e.g. `2025-W32`) |
| Weekly Feature by Author | `AUTHOR#{authorId}` | `FEATURE#WEEK#{isoWeek}` | Query all bookings by Author (eligibility check, history) |
| Daily Feature Log | `FEATURE#DAILY` | `DATE#{isoDate}` | Log of daily featured Author selections; SK sorted by date for last-7 exclusion window |
| Stripe Connect Lookup | `CONNECT#{stripeConnectAccountId}` | `META` | Reverse-lookup record: maps a Stripe Connect account ID → `userId`; written by `POST /subscriptions/connect/onboard` when the Connect account is first created; read by the `account.updated` webhook handler (FR-SUB-13) |

**GSIs:**

| GSI Name | PK | SK | Purpose |
|---|---|---|---|
| `GSI-AuthorPublic` | `authorId` | `visibility#createdAt` | Browse an Author's public pieces in order |
| `GSI-AllPublicPieces` | `status` (= `PUBLIC`) | `createdAt` | Global browse / homepage feed |
| `GSI-FollowersByAuthor` | `authorId` (follow record) | `followedAt` | Count/list followers of an Author |
| `GSI-SubscribersByAuthor` | `authorId` (sub record) | `subscribedAt` | Count/list subscribers of an Author |
| `GSI-TagIndex` | `tag` | `createdAt` | Browse by tag |
| `GSI-WeeklyFeatureByStatus` | `featureStatus` (= `CONFIRMED`\|`ACTIVE`\|`ARCHIVED`) | `isoWeek` | Query all confirmed/active bookings for a given week; used by homepage and maintenance rotation |
| `GSI-AuthorDirectory` | `profileType` (= `'AUTHOR'`) | `createdAt` | Paginated author directory (newest sort); filter `status = 'ACTIVE'` in application |
| `GSI-AllFreeCollections` | `collectionBrowse` (= `'FREE'`) | `createdAt` | Browse all FREE collections globally; homepage "Explore Collections" section (FR-DISC-06) + browse-collections page (FR-DISC-07). Only FREE collection METADATA items carry this attribute (sparse GSI). |

#### Idempotency Table: `duseum-{env}-idempotency`

| PK | TTL | Purpose |
|---|---|---|
| `STRIPE#{eventId}` | 7 days | Deduplicate processed Stripe webhook events |

#### Config Table: `duseum-{env}-config`

| PK | Data | Purpose |
|---|---|---|
| `FREE_TIER_LIMIT` | `{ value: 10 }` | Platform-configurable free piece count |
| `PLATFORM_CUT_PERCENT` | `{ value: 20 }` | Author subscription revenue cut |
| `PLATFORM_SUB_PRICE_ID` | `{ value: "price_xxx" }` | Stripe Price ID for platform subscription |
| `FEATURED_AUTHORS` | `{ authorIds: [...] }` | Homepage featured Authors (admin-curated; legacy/fallback only) |
| `DAILY_FEATURED_AUTHOR` | `{ authorId, selectedAt, overriddenBy? }` | Today's Daily Featured Author; written by `maintenance-lambda` daily |
| `DAILY_FEATURED_EXCLUSIONS` | `{ authorIds: [...] }` | Last 7 Daily Featured Author IDs; used to prevent consecutive repeats |
| `WEEKLY_FEATURE_FEE_USD` | `{ value: 25 }` | One-time fee for a weekly feature slot (admin-configurable) |
| `WEEKLY_FEATURE_SLOT_COUNT` | `{ value: 3 }` | Max simultaneous weekly featured Authors (admin-configurable; dev + prod seeded at 3) |
| `WEEKLY_FEATURE_ADVANCE_WEEKS` | `{ value: 8 }` | How many weeks ahead Authors can book (admin-configurable) |

---

## 5. AWS Infrastructure & Resources

All infrastructure is managed by AWS CDK (TypeScript) inside `infrastructure/` in the monorepo.

### 5.1 Jargon

**Stack** — a CDK stack that groups related AWS resources under a single deployment unit. A stack is the unit of provisioning.

**Stage** — a CDK stage combining multiple stacks, representing a full environment (dev or prod).

**Cross-stack wiring** — values shared between stacks are passed via CDK stack outputs / SSM Parameter Store. No hardcoded ARNs anywhere.

### 5.2 Stack Inventory

| Stack | Type | CDK Source | Resources |
|---|---|---|---|
| `NetworkStack` | Infrastructure | `stacks/network` | VPC (optional — most serverless resources don't need it), NAT GW (only if VPC needed for RDS/ElastiCache in future) |
| `StorageStack` | Infrastructure | `stacks/storage` | S3 media bucket (private), S3 SPA bucket (public website), DynamoDB tables (main, idempotency, config), S3 bucket policies granting CloudFront OAC (`cloudfront.amazonaws.com`) `s3:GetObject` access (scoped to `AWS:SourceAccount`) |
| `AuthStack` | Infrastructure | `stacks/auth` | Cognito User Pool, User Pool Client, Google OAuth federation, Post-Confirmation Lambda trigger |
| `CdnStack` | Infrastructure | `stacks/cdn` | CloudFront distribution for SPA, CloudFront distribution for media (with signed URL OAC), ACM certificate, Route53 records |
| `MessagingStack` | Infrastructure | `stacks/messaging` | SQS queue (Stripe webhooks), SQS DLQ, SQS queue (new-piece notifications), SQS DLQ (notifications), EventBridge rule: daily featured author selection (`cron(0 0 * * ? *)`), EventBridge rule: weekly feature rotation (`cron(0 0 ? * MON *)`), SNS admin alerts topic |
| `ApiStack` | Application | `stacks/api` | API Gateway HTTP API, Lambda functions (all 8), Lambda IAM roles, API GW → Lambda integrations, Cognito authorizer |
| `MonitoringStack` | Observability | `stacks/monitoring` | CloudWatch dashboards, alarms (Lambda errors, DLQ depth, API 5xx), X-Ray groups |

### 5.3 Stack Dependency Graph & Provisioning Order

```
StorageStack ──────────────────────────────────────────────────┐
AuthStack ─────────────────────────────────────────────────────┤
MessagingStack ─────────────────────────────────────────────────┤──► ApiStack
CdnStack ──────────────────────────────────────────────────────┘        │
                                                                         ▼
                                                                  MonitoringStack
```

**Rule**: Infrastructure stacks (Storage, Auth, Messaging, Cdn) must be deployed first. ApiStack depends on outputs from all infrastructure stacks. MonitoringStack depends on ApiStack (needs Lambda ARNs for alarms).

### 5.4 SSM Parameter Store — Cross-Stack Wiring

**Naming convention:**
```
/duseum/{env}/stacks/{stack}/{key}
```

**Complete SSM output registry:**

```
# StorageStack outputs
/duseum/{env}/stacks/storage/media_bucket_name
/duseum/{env}/stacks/storage/media_bucket_arn
/duseum/{env}/stacks/storage/spa_bucket_name
/duseum/{env}/stacks/storage/dynamodb_main_table_name
/duseum/{env}/stacks/storage/dynamodb_idempotency_table_name
/duseum/{env}/stacks/storage/dynamodb_config_table_name

# AuthStack outputs
/duseum/{env}/stacks/auth/user_pool_id
/duseum/{env}/stacks/auth/user_pool_client_id
/duseum/{env}/stacks/auth/user_pool_arn
/duseum/{env}/stacks/auth/post_confirm_lambda_arn

# CdnStack outputs
/duseum/{env}/stacks/cdn/app_distribution_id
/duseum/{env}/stacks/cdn/app_distribution_domain
/duseum/{env}/stacks/cdn/media_distribution_id
/duseum/{env}/stacks/cdn/media_distribution_domain
/duseum/{env}/stacks/cdn/cloudfront_key_pair_id        # for signed URLs
/duseum/{env}/stacks/cdn/acm_certificate_arn

# MessagingStack outputs
/duseum/{env}/stacks/messaging/stripe_webhook_queue_url
/duseum/{env}/stacks/messaging/stripe_webhook_queue_arn
/duseum/{env}/stacks/messaging/stripe_webhook_dlq_url
/duseum/{env}/stacks/messaging/notification_queue_url
/duseum/{env}/stacks/messaging/notification_queue_arn
/duseum/{env}/stacks/messaging/notification_dlq_url
/duseum/{env}/stacks/messaging/sns_admin_alerts_arn
/duseum/{env}/stacks/messaging/daily_feature_rule_name
/duseum/{env}/stacks/messaging/weekly_rotation_rule_name

# ApiStack outputs
/duseum/{env}/stacks/api/api_gateway_url
/duseum/{env}/stacks/api/api_gateway_id
/duseum/{env}/stacks/api/artworks_lambda_arn
/duseum/{env}/stacks/api/users_lambda_arn
/duseum/{env}/stacks/api/subscriptions_lambda_arn
/duseum/{env}/stacks/api/notifications_lambda_arn
/duseum/{env}/stacks/api/features_lambda_arn
/duseum/{env}/stacks/api/social_lambda_arn
/duseum/{env}/stacks/api/admin_lambda_arn
/duseum/{env}/stacks/api/media_lambda_arn
/duseum/{env}/stacks/api/webhook_lambda_arn
/duseum/{env}/stacks/api/maintenance_lambda_arn
```

### 5.5 AWS Resource Naming Convention

```
duseum-{env}-{resource-type}-{descriptor}

Examples:
  duseum-dev-dynamodb-main
  duseum-dev-dynamodb-idempotency
  duseum-dev-s3-media
  duseum-dev-s3-spa
  duseum-dev-sqs-stripe-webhooks
  duseum-dev-sqs-stripe-webhooks-dlq
  duseum-dev-sqs-notifications
  duseum-dev-sqs-notifications-dlq
  duseum-dev-lambda-artworks
  duseum-dev-lambda-notifications
  duseum-dev-lambda-features
  duseum-dev-lambda-subscriptions-webhook
  duseum-dev-lambda-maintenance
  duseum-dev-cognito-userpool
  duseum-dev-cloudfront-app
  duseum-dev-cloudfront-media
  duseum-dev-eventbridge-daily-featured-author
  duseum-dev-eventbridge-weekly-feature-rotation
```

### 5.6 IAM — Least Privilege Lambda Roles

Each Lambda function has its own IAM role granting only what it needs:

| Lambda | DynamoDB | S3 | Cognito | Secrets Manager | SQS | Other |
|---|---|---|---|---|---|---|
| `artworks-lambda` | ReadWrite (main table) | PutObject (media bucket) | — | Read (CloudFront key) | SendMessage (notification queue) | — |
| `users-lambda` | ReadWrite (main table) | PutObject (media bucket) | AdminGetUser | — | — | — |
| `subscriptions-lambda` | ReadWrite (main table) | — | — | Read (Stripe key) | — | — |
| `subscriptions-webhook-lambda` | ReadWrite (main, idempotency) | — | — | Read (Stripe webhook secret) | ReceiveMessage, DeleteMessage (webhook queue) | — |
| `notifications-lambda` | ReadWrite (main table) | — | — | — | ReceiveMessage, DeleteMessage (notification queue) | SES SendBulkEmail |
| `features-lambda` | ReadWrite (main, config tables) | — | — | Read (Stripe key) | — | — |
| `social-lambda` | ReadWrite (main table) | — | — | — | — | — |
| `admin-lambda` | ReadWrite (all tables) | — | AdminGetUser, AdminDisableUser | Read (all) | — | — |
| `auth-triggers-lambda` | PutItem (main table) | — | — | — | — | — |
| `media-lambda` | ReadWrite (main table) | PutObject presign only | — | — | — | — |
| `maintenance-lambda` | ReadWrite (all tables) | — | — | — | — | — |

### 5.7 Secrets Manager Keys

```
duseum/{env}/stripe/secret-key               # Stripe secret key (sk_test_ / sk_live_)
duseum/{env}/stripe/webhook-secret           # Connect webhook signing secret — events from Express accounts (account.updated)
duseum/{env}/stripe/webhook-secret-account   # Account webhook signing secret — platform events (payment_intent.*, customer.subscription.*, invoice.*)
duseum/{env}/stripe/connect-client-id        # Stripe Connect client ID
duseum/{env}/cloudfront/private-key          # CloudFront signed URL RSA private key (PEM)
duseum/{env}/ses/from-address                # Verified SES sender address (e.g. no-reply@duseum.com)
duseum/{env}/notifications/unsubscribe-secret # HMAC secret for signing one-click unsubscribe tokens
```

---

## 6. Software Design

### 6.1 Monorepo Structure

```
duseum/
├── frontend/                        # React SPA (Vite + TypeScript + Tailwind)
│   ├── src/
│   │   ├── components/              # Reusable UI components
│   │   │   ├── ui/                  # Primitives: Button, Badge, Divider, Pill, Spinner
│   │   │   ├── layout/              # Nav, Footer, PageWrapper, SectionContainer
│   │   │   ├── artwork/             # ArtPieceCard, ArtPieceGrid, ArtPieceDetail
│   │   │   ├── author/              # AuthorCard, AuthorProfile, FrameOrnament
│   │   │   ├── feature/             # DailySpotlight, WeeklyCarousel, FeatureBookingCalendar
│   │   │   ├── subscription/        # TierCard, SubscribeCTA, PlatformSubBanner
│   │   │   └── social/              # CommentThread, ReactionBar, FollowButton
│   │   ├── pages/                   # Route-level page components
│   │   │   ├── HomePage.tsx
│   │   │   ├── BrowsePage.tsx
│   │   │   ├── ArtPieceDetailPage.tsx
│   │   │   ├── AuthorProfilePage.tsx
│   │   │   ├── AuthorDirectoryPage.tsx
│   │   │   ├── auth/                # LoginPage, RegisterPage, VerifyEmailPage
│   │   │   ├── dashboard/           # ViewerDashboard, AuthorDashboard
│   │   │   ├── settings/            # AccountSettings, NotificationSettings
│   │   │   └── admin/               # AdminShell, AdminUsers, AdminFeatures
│   │   ├── hooks/                   # React Query data hooks (use{Entity}.ts)
│   │   ├── services/                # Raw API fetch wrappers ({entity}.service.ts)
│   │   ├── store/                   # Zustand stores (auth.store.ts, ui.store.ts)
│   │   ├── styles/
│   │   │   └── globals.css          # Tailwind directives + CSS custom properties (design tokens)
│   │   └── lib/
│   │       ├── auth.ts              # AWS Amplify Cognito helpers
│   │       └── utils.ts             # cn() class merger, date formatters, currency helpers
│   ├── public/
│   │   └── fonts/                   # Self-hosted font fallbacks if needed
│   ├── tailwind.config.ts           # Extends Tailwind with Duseum design tokens
│   ├── postcss.config.js
│   └── vite.config.ts
│
├── lambdas/                         # All Lambda function handlers
│   ├── artworks/
│   │   ├── src/
│   │   │   ├── handler.ts           # Lambda entry point
│   │   │   ├── routes/              # Route handlers per HTTP method/path
│   │   │   └── middleware/
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── users/
│   ├── subscriptions/
│   ├── subscriptions-webhook/
│   ├── notifications/
│   ├── features/
│   ├── social/
│   ├── admin/
│   ├── auth-triggers/
│   ├── media/
│   └── maintenance/
│
├── packages/
│   └── shared/                      # Shared TypeScript modules (imported by all lambdas)
│       ├── src/
│       │   ├── db/                  # DynamoDB client + repository helpers
│       │   ├── auth/                # JWT validation helpers, Cognito utilities
│       │   ├── types/               # Shared TypeScript types/interfaces
│       │   ├── errors/              # Custom error classes (AppError, NotFoundError, etc.)
│       │   ├── middleware/          # Shared Middy middleware (auth, error handling, logging)
│       │   ├── stripe/              # Stripe client wrapper
│       │   ├── s3/                  # S3/CloudFront utility helpers
│       │   ├── notifications/       # Notification preference resolver, unsubscribe token sign/verify
│       │   └── features/            # Feature booking logic: eligibility check, slot count, ISO week utilities
│       └── package.json
│
├── infrastructure/                  # AWS CDK (TypeScript)
│   ├── bin/
│   │   └── duseum.ts             # CDK app entry point; defines stages
│   ├── stacks/
│   │   ├── storage-stack.ts
│   │   ├── auth-stack.ts
│   │   ├── cdn-stack.ts
│   │   ├── messaging-stack.ts
│   │   ├── api-stack.ts
│   │   └── monitoring-stack.ts
│   ├── constructs/                  # Reusable CDK constructs
│   │   ├── lambda-function.ts       # Standard Lambda construct with X-Ray, logging, etc.
│   │   └── duseum-stage.ts       # Full environment stage (dev/prod)
│   └── cdk.json
│
├── scripts/                         # Developer utility scripts
│   ├── seed-local.ts                # Seed DynamoDB Local with test data
│   └── smoke-test.sh                # Post-deploy smoke tests
│
├── .github/
│   └── workflows/
│       ├── ci.yml                   # PR checks (lint, typecheck, test)
│       ├── deploy-dev.yml           # Deploy to dev on push to develop
│       ├── deploy-prod.yml          # Deploy to prod on tag v*.*.*
│       └── _deploy-lambdas.yml      # Reusable: build + deploy all Lambdas
│
├── package.json                     # Root workspace package.json (npm workspaces)
└── turbo.json                       # Turborepo build pipeline config
```

### 6.2 Lambda Handler Pattern

Every Lambda uses **Middy** as the middleware framework — the serverless equivalent of Express middleware. Business logic is cleanly separated from cross-cutting concerns.

```typescript
// lambdas/artworks/src/handler.ts
import middy from '@middy/core'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda'
import { cognitoAuthMiddleware } from '@duseum/shared/middleware/auth'
import { errorHandlerMiddleware } from '@duseum/shared/middleware/error-handler'
import { loggerMiddleware } from '@duseum/shared/middleware/logger'
import { router } from './router'

const baseHandler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  return router(event)
}

export const handler = middy(baseHandler)
  .use(loggerMiddleware())
  .use(cognitoAuthMiddleware())   // validates JWT, attaches user context to event
  .use(errorHandlerMiddleware())  // catches AppError subclasses → structured responses
```

### 6.3 Routing Pattern

Each Lambda implements a lightweight router — no Express, no Hono, no framework. Just a plain TypeScript switch/match on method + path.

```typescript
// lambdas/artworks/src/router.ts
import { APIGatewayProxyEventV2 } from 'aws-lambda'
import { listArtworks }    from './routes/list-artworks'
import { getArtwork }      from './routes/get-artwork'
import { createArtwork }   from './routes/create-artwork'
import { updateArtwork }   from './routes/update-artwork'
import { deleteArtwork }   from './routes/delete-artwork'
import { NotFoundError }   from '@duseum/shared/errors'

export const router = async (event: APIGatewayProxyEventV2) => {
  const { method, path } = event.requestContext.http
  const artworkId = event.pathParameters?.artworkId

  if (method === 'GET'    && path === '/artworks')             return listArtworks(event)
  if (method === 'GET'    && artworkId)                        return getArtwork(event, artworkId)
  if (method === 'POST'   && path === '/artworks')             return createArtwork(event)
  if (method === 'PUT'    && artworkId)                        return updateArtwork(event, artworkId)
  if (method === 'DELETE' && artworkId)                        return deleteArtwork(event, artworkId)

  throw new NotFoundError('Route not found')
}
```

### 6.4 Shared Repository Pattern

All DynamoDB operations go through typed repository functions in `packages/shared/src/db/`. No raw DynamoDB calls in Lambda handler files.

```typescript
// packages/shared/src/db/artworks.repository.ts
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { ArtPiece, ArtPieceVisibility } from '../types/art-piece'
import { TABLE_NAME } from './client'

export const getArtPiece = async (
  client: DynamoDBDocumentClient,
  artworkId: string
): Promise<ArtPiece | null> => {
  const result = await client.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: `ARTWORK#${artworkId}`, SK: 'METADATA' }
  }))
  return result.Item as ArtPiece ?? null
}

export const listArtPiecesByAuthor = async (
  client: DynamoDBDocumentClient,
  authorId: string,
  visibility?: ArtPieceVisibility,
  limit = 20,
  lastKey?: Record<string, unknown>
): Promise<{ items: ArtPiece[]; lastKey?: Record<string, unknown> }> => {
  // Uses GSI-AuthorPublic
  const result = await client.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'GSI-AuthorPublic',
    KeyConditionExpression: 'authorId = :authorId',
    FilterExpression: visibility ? 'visibility = :vis' : undefined,
    ExpressionAttributeValues: {
      ':authorId': authorId,
      ...(visibility && { ':vis': visibility })
    },
    Limit: limit,
    ExclusiveStartKey: lastKey
  }))
  return { items: result.Items as ArtPiece[], lastKey: result.LastEvaluatedKey }
}
```

### 6.5 Access Tier Enforcement

Access tier checks are centralized in `packages/shared/src/auth/access-control.ts`. This logic is called from `artworks-lambda` on every art piece read.

```typescript
// packages/shared/src/auth/access-control.ts

export type AccessContext = {
  viewerId: string
  isAuthor: boolean          // is this the Author of the piece?
  isPlatformSubscriber: boolean
  isAuthorSubscriber: boolean  // subscribed to this specific Author
}

export type AccessDecision =
  | { allowed: true;  signUrl: boolean }  // signUrl=true for private pieces
  | { allowed: false; reason: 'REQUIRES_PLATFORM_SUB' | 'REQUIRES_AUTHOR_SUB' | 'FORBIDDEN' }

export const checkArtPieceAccess = (
  piece: ArtPiece,
  ctx: AccessContext,
  freeTierLimit: number,
  authorPieceIndex: number  // 1-based rank of this piece in Author's public gallery
): AccessDecision => {
  // Author can always see their own work
  if (ctx.isAuthor) return { allowed: true, signUrl: piece.visibility === 'DRAFT' }

  // Private pieces require Author subscription
  if (piece.visibility === 'PRIVATE') {
    if (ctx.isAuthorSubscriber) return { allowed: true, signUrl: true }
    return { allowed: false, reason: 'REQUIRES_AUTHOR_SUB' }
  }

  // Draft pieces: Author only (handled above)
  if (piece.visibility === 'DRAFT') return { allowed: false, reason: 'FORBIDDEN' }

  // PUBLIC pieces: check free tier limit
  if (authorPieceIndex <= freeTierLimit) return { allowed: true, signUrl: false }
  if (ctx.isPlatformSubscriber)          return { allowed: true, signUrl: false }

  return { allowed: false, reason: 'REQUIRES_PLATFORM_SUB' }
}
```

### 6.6 Key Domain Types

```typescript
// packages/shared/src/types/

export type UserAccount = {
  userId: string               // Cognito sub (UUID)
  email: string
  systemRole: 'USER' | 'ADMIN'
  emailVerified: boolean
  createdAt: string            // ISO 8601
  lastLoginAt: string
}

export type ViewerProfile = {
  userId: string
  profileType: 'VIEWER'
  status: 'ACTIVE' | 'SUSPENDED'
  displayName: string
  createdAt: string
  notificationGlobalOptOut: boolean    // true = suppress ALL new-piece emails regardless of per-author prefs
  defaultNotificationPref: NotificationPref  // applied when no per-author override exists; default: ALL_NEW_PIECES
}

export type NotificationPref = 'ALL_NEW_PIECES' | 'PUBLIC_ONLY' | 'NONE'

export type NotificationPreference = {
  viewerId: string                     // userId of the Viewer
  authorId: string                     // which Author this preference is for
  pref: NotificationPref               // overrides the Viewer's defaultNotificationPref for this Author
  updatedAt: string                    // ISO 8601; set on every write
}

export type AuthorProfile = {
  userId: string
  profileType: 'AUTHOR'
  status: 'PENDING_SETUP' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED'
  displayName: string
  bio: string
  profilePhotoS3Key: string | null
  coverPhotoS3Key: string | null
  stripeConnectAccountId: string | null
  authorSubscriptionPriceId: string | null  // Stripe Price ID; null if subscriptions disabled
  authorSubscriptionMonthlyUsd: number | null
  featuredPieceIds: string[]   // up to 3 pinned pieces
  createdAt: string
  totalPiecesCount: number     // denormalized counter
  followerCount: number        // denormalized counter
  subscriberCount: number      // denormalized counter
}

export type ArtPiece = {
  artworkId: string
  authorId: string
  title: string
  description: string
  tags: string[]               // normalized lowercase
  category: ArtCategory
  visibility: 'PUBLIC' | 'PRIVATE' | 'DRAFT'
  status: 'ACTIVE' | 'ARCHIVED'
  s3Key: string                // S3 object key (UUID-based)
  mimeType: string
  fileSizeBytes: number
  viewCount: number
  commentsEnabled: boolean
  notifiedCount: number                // async counter; updated by notifications-lambda after fan-out
  createdAt: string
  updatedAt: string
  publishedAt: string | null
}

export type ArtCategory =
  | 'PAINTING' | 'DIGITAL' | 'PHOTOGRAPHY' | 'SCULPTURE'
  | 'ILLUSTRATION' | 'MIXED_MEDIA' | 'OTHER'

export type Subscription = {
  userId: string               // subscriber
  targetId: 'PLATFORM' | string  // 'PLATFORM' or authorId
  stripeSubscriptionId: string
  stripeCustomerId: string
  status: 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'INCOMPLETE'
  currentPeriodEnd: string     // ISO 8601
  createdAt: string
}

export type UploadIntent = {
  intentId: string
  uploaderId: string           // userId
  s3Key: string
  mimeType: string
  declaredSizeBytes: number
  status: 'PENDING' | 'CONSUMED' | 'EXPIRED'
  expiresAt: string            // ISO 8601; 10 min from creation
  createdAt: string
}

export type Comment = {
  commentId: string
  artworkId: string
  authorId: string             // userId of commenter
  body: string                 // max 1,000 chars
  parentCommentId: string | null
  isPinned: boolean
  isDeleted: boolean           // soft delete by author or admin
  createdAt: string
}

export type Reaction = {
  artworkId: string
  userId: string
  reactionType: 'LOVE' | 'WOW' | 'FIRE' | 'INSPIRED'
  reactedAt: string
}

export type WeeklyFeatureBooking = {
  bookingId: string            // UUID
  authorId: string
  isoWeek: string              // ISO week string: "YYYY-Www" (e.g. "2025-W32")
  weekStartDate: string        // ISO 8601 date of the Monday that starts the week
  weekEndDate: string          // ISO 8601 date of the Sunday that ends the week
  featureStatus: 'CONFIRMED'   // payment captured, upcoming
    | 'ACTIVE'                 // currently live this week (set by maintenance-lambda Monday rotation)
    | 'ARCHIVED'               // week has passed
    | 'CANCELLED'              // cancelled by Admin; slot freed
  stripePaymentIntentId: string
  amountPaidUsd: number        // snapshot of fee at booking time (admin may change fee later)
  bookedAt: string             // ISO 8601
  activatedAt: string | null   // set when maintenance-lambda promotes to ACTIVE
  cancelledAt: string | null   // set if Admin cancels
  cancelledBy: string | null   // admin userId
}

export type DailyFeatureLog = {
  date: string                 // ISO 8601 date: "YYYY-MM-DD"
  authorId: string
  selectedAt: string           // ISO 8601 datetime (when maintenance-lambda ran)
  selectionMethod: 'RANDOM' | 'ADMIN_OVERRIDE'
  overriddenBy: string | null  // admin userId if ADMIN_OVERRIDE
}
```

### 6.7 Error Handling

All Lambda errors are handled by `errorHandlerMiddleware` which catches `AppError` subclasses and maps them to HTTP responses in a consistent structure.

```typescript
// packages/shared/src/errors/index.ts
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) { super(message) }
}

export class NotFoundError      extends AppError { constructor(msg = 'Not found')    { super(404, 'NOT_FOUND', msg) } }
export class UnauthorizedError  extends AppError { constructor(msg = 'Unauthorized') { super(401, 'UNAUTHORIZED', msg) } }
export class ForbiddenError     extends AppError { constructor(msg = 'Forbidden')    { super(403, 'FORBIDDEN', msg) } }
export class PaymentRequiredError extends AppError { constructor(msg: string)        { super(402, 'PAYMENT_REQUIRED', msg) } }
export class ValidationError    extends AppError { constructor(msg: string)          { super(400, 'VALIDATION_ERROR', msg) } }
export class ConflictError      extends AppError { constructor(msg: string)          { super(409, 'CONFLICT', msg) } }

// Response format for ALL errors:
// {
//   "error": {
//     "code": "NOT_FOUND",
//     "message": "Art piece not found",
//     "requestId": "abc-123"
//   }
// }
```

---

### 6.8 Frontend Design System

> **Source of truth for all visual decisions.** Every color, font, spacing value, and component pattern used in the Duseum frontend is defined here. AI-assisted development must reference this section before writing any component, page, or style. The design system is derived from and consistent with the Duseum landing page (`index.html`). Do not introduce colors, fonts, or patterns not listed here without updating this section first.

#### 6.8.1 Aesthetic Direction

**Theme**: Refined editorial/gallery — the UI should feel like entering a well-curated museum. Warm, near-black backgrounds. Amber-gold accents. Generous negative space. Typography-led hierarchy. Subtle depth through layered borders and gentle gradients rather than flat solid fills.

**Tone**: Restrained luxury. Never loud. Never generic. The gold accent earns its presence — it marks actions, highlights, and structure, not decoration.

**Anti-patterns to avoid**:
- Purple gradients on white backgrounds (generic AI aesthetic)
- Inter, Roboto, or system fonts as the display face
- Solid opaque cards with sharp box-shadows
- High-saturation color palettes
- Blue primary CTAs

#### 6.8.2 Design Tokens — CSS Custom Properties

All tokens are defined as CSS custom properties on `:root` in `frontend/src/styles/globals.css` and mirrored into `tailwind.config.ts` for use as Tailwind utility classes.

```css
/* frontend/src/styles/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  /* ── Color Palette ──────────────────────────────────────── */
  --color-ink:          #0e0d0b;   /* Primary background — near-black with warm undertone */
  --color-ink-soft:     #1c1a16;   /* Elevated surfaces (cards, sidebars, nav) */
  --color-ink-raised:   #252220;   /* Hover states on elevated surfaces */
  --color-parchment:    #f5f0e8;   /* Primary text on dark backgrounds */
  --color-parchment-dim:#ede7d9;   /* Secondary text, muted headings */
  --color-gold:         #c8973a;   /* Primary accent — borders, labels, icons, CTAs */
  --color-gold-light:   #e8b55a;   /* Gold hover state, italic heading highlight */
  --color-gold-dim:     #8a642a;   /* Muted gold for disabled/subtle use */
  --color-gold-subtle:  rgba(200, 151, 58, 0.08);  /* Gold tint backgrounds */
  --color-gold-border:  rgba(200, 151, 58, 0.18);  /* Gold border (default opacity) */
  --color-gold-border-strong: rgba(200, 151, 58, 0.4); /* Gold border (hover/focus) */
  --color-stone:        #4a4540;   /* Strong muted text */
  --color-stone-light:  #7a7068;   /* Body text on dark backgrounds, placeholders */
  --color-white:        #fdfaf4;   /* Warm white for headings, logo, pure highlights */

  /* ── Status Colors ──────────────────────────────────────── */
  --color-success:      #5a9e6e;   /* Green for live/active indicators */
  --color-error:        #c0544a;   /* Error states */
  --color-warning:      #c8973a;   /* Reuses gold — warnings feel editorial not alarming */

  /* ── Typography ─────────────────────────────────────────── */
  --font-display: 'Playfair Display', Georgia, serif;
  --font-body:    'DM Sans', system-ui, sans-serif;
  --font-mono:    'DM Mono', monospace;

  /* ── Spacing Scale (base 4px) ───────────────────────────── */
  /* Uses Tailwind default scale — no custom overrides needed */

  /* ── Border Radius ──────────────────────────────────────── */
  --radius-sm:  2px;   /* Cards, tags, pills, inputs */
  --radius-md:  4px;   /* Buttons, nav logo mark */
  --radius-full: 9999px; /* Circular elements (status dot, reaction chips) */

  /* ── Easing ─────────────────────────────────────────────── */
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-out:   cubic-bezier(0.4, 0, 0.2, 1);

  /* ── Transitions ────────────────────────────────────────── */
  --transition-fast:   150ms var(--ease-in-out);
  --transition-base:   250ms var(--ease-in-out);
  --transition-slow:   400ms var(--ease-out-expo);
  --transition-reveal: 800ms var(--ease-out-expo);
}
```

#### 6.8.3 Tailwind Configuration

```typescript
// frontend/tailwind.config.ts
import type { Config } from 'tailwindcss'

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink:        { DEFAULT: '#0e0d0b', soft: '#1c1a16', raised: '#252220' },
        parchment:  { DEFAULT: '#f5f0e8', dim: '#ede7d9' },
        gold:       { DEFAULT: '#c8973a', light: '#e8b55a', dim: '#8a642a' },
        stone:      { DEFAULT: '#4a4540', light: '#7a7068' },
        'warm-white': '#fdfaf4',
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        body:    ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono:    ['"DM Mono"', 'monospace'],
      },
      borderRadius: {
        sm:  '2px',
        DEFAULT: '2px',
        md:  '4px',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      transitionDuration: {
        '400': '400ms',
        '800': '800ms',
      },
      backgroundImage: {
        // Reusable atmospheric hero gradient
        'hero-glow': `
          radial-gradient(ellipse 70% 60% at 50% 40%, rgba(200,151,58,0.06) 0%, transparent 70%),
          radial-gradient(ellipse 40% 50% at 20% 80%, rgba(200,151,58,0.04) 0%, transparent 60%)
        `,
        // Subtle grid texture (applied via inline style or a wrapper class)
        'grid-texture': `
          linear-gradient(rgba(200,151,58,0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(200,151,58,0.04) 1px, transparent 1px)
        `,
      },
      animation: {
        'fade-up':    'fadeUp 0.9s cubic-bezier(0.16,1,0.3,1) both',
        'fade-in':    'fadeIn 0.6s ease both',
        'float':      'float 2.5s ease-in-out infinite',
        'rotate-slow':'rotateSlow 20s linear infinite',
      },
      keyframes: {
        fadeUp:     { from: { opacity: '0', transform: 'translateY(32px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        fadeIn:     { from: { opacity: '0' }, to: { opacity: '1' } },
        float:      { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
        rotateSlow: { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } },
      },
    },
  },
  plugins: [],
} satisfies Config
```

#### 6.8.4 Typography System

| Role | Font | Size | Weight | Usage |
|---|---|---|---|---|
| **Display / Hero** | Playfair Display | `clamp(3.2rem, 8vw, 6.5rem)` | 400 (regular) | Hero `h1`, major section titles |
| **Section Title** | Playfair Display | `clamp(2rem, 4vw, 3rem)` | 400 | Section `h2` |
| **Card Title** | Playfair Display | `1.15–1.2rem` | 600 (semibold) | Feature cards, tier names |
| **Eyebrow / Label** | DM Sans | `0.68–0.72rem` | 500 | Section labels, badges, nav links |
| **Body** | DM Sans | `0.88–1.05rem` | 300 (light) | Descriptive copy, card text |
| **UI / CTA** | DM Sans | `0.8–0.9rem` | 400–500 | Buttons, links, metadata |
| **Code / Mono** | DM Mono | `0.78rem` | 400 | Tech pills, architecture diagrams, code blocks |
| **Large Number** | Playfair Display | `2.5rem` | 400 | Feature card ordinal numbers |

**Italic usage**: Playfair Display italic (`font-style: italic`) is used specifically for:
- Hero subtitle lines (e.g. "a real stage.")
- Gold-colored heading emphasis words (e.g. section title second lines)
- Pull quotes and mission statements
- Never used for body copy or UI labels

**Font loading** (in `index.html` and as a `<link>` in the React app's root):
```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400;1,600&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
```

#### 6.8.5 Color Usage Rules

| Token | Tailwind Class | When to use |
|---|---|---|
| `--color-ink` | `bg-ink` | Page background, outermost layer |
| `--color-ink-soft` | `bg-ink-soft` | Elevated sections (alternating), nav background, sidebars |
| `--color-ink-raised` | `bg-ink-raised` | Hover state on cards within `ink-soft` surfaces |
| `--color-parchment` | `text-parchment` | Primary text on dark backgrounds |
| `--color-parchment-dim` | `text-parchment-dim` | Secondary text, muted headings, descriptions |
| `--color-gold` | `text-gold`, `border-gold`, `bg-gold` | Labels, borders, eyebrows, primary CTA background |
| `--color-gold-light` | `text-gold-light` | Italic display emphasis, gold hover states |
| `--color-stone-light` | `text-stone-light` | Body text on dark bg, nav links, meta |
| `--color-white` | `text-warm-white` | Headings, logo wordmark, `h1` text |

**Section alternation pattern** (used on every page):
```
Odd sections:  bg-ink       (pure near-black)
Even sections: bg-ink-soft  (slightly elevated warm dark)
Borders between: border-t border-gold/10
```

#### 6.8.6 Component Patterns

All components use Tailwind utility classes. No styled-components, no CSS modules, no inline `style` props. The `cn()` utility (from `clsx` + `tailwind-merge`) merges conditional classes.

##### Button

Three variants — all share the same base sizing and uppercase tracking:

```tsx
// Primary: gold fill, dark text
<button className="inline-flex items-center gap-2 bg-gold hover:bg-gold-light text-ink font-body text-sm font-medium uppercase tracking-[0.04em] px-8 py-[0.9rem] rounded-sm transition-colors duration-150 hover:-translate-y-px">
  View on GitHub
</button>

// Secondary: transparent, gold border
<button className="inline-flex items-center gap-2 bg-transparent border border-gold/25 hover:border-gold/60 text-parchment-dim hover:text-warm-white font-body text-sm font-light uppercase tracking-[0.04em] px-8 py-[0.9rem] rounded-sm transition-all duration-200 hover:-translate-y-px">
  Explore
</button>

// Ghost / Nav CTA: gold text, thin border
<button className="text-gold border border-gold/40 hover:border-gold hover:bg-gold/10 font-body text-[0.8rem] font-medium uppercase tracking-[0.04em] px-[1.1rem] py-[0.45rem] rounded-md transition-all duration-200">
  GitHub
</button>
```

##### Badge / Tier Badge

```tsx
// Gold accent badge (paid tiers)
<span className="inline-block text-[0.62rem] font-medium tracking-[0.16em] uppercase text-gold bg-gold/12 px-[0.6rem] py-[0.25rem] rounded-sm">
  Platform Subscriber
</span>

// Muted badge (free tier)
<span className="inline-block text-[0.62rem] font-medium tracking-[0.16em] uppercase text-stone-light bg-stone/15 px-[0.6rem] py-[0.25rem] rounded-sm">
  Viewer — Free
</span>
```

##### Section Eyebrow / Label

```tsx
// Used above every section title
<p className="text-[0.68rem] font-medium tracking-[0.2em] uppercase text-gold mb-4">
  Platform Features
</p>
```

##### Divider (Gold accent line)

```tsx
<div className="w-12 h-px bg-gold opacity-50 my-6" />
```

##### Tech / Feature Pill

```tsx
// Default (dimmer)
<span className="inline-flex items-center gap-2 font-mono text-[0.78rem] text-stone-light bg-white/[0.03] border border-gold/12 px-[0.9rem] py-[0.4rem] rounded-sm hover:bg-gold/6 hover:border-gold/30 hover:text-parchment transition-all duration-200 cursor-default">
  <span className="w-[5px] h-[5px] rounded-full bg-gold opacity-50 flex-shrink-0" />
  AWS Lambda
</span>

// Highlighted (AWS services)
<span className="... border-gold/30 text-parchment-dim">
  DynamoDB (single-table)
</span>
```

##### Feature Card (Grid)

```tsx
<div className="relative bg-ink p-10 overflow-hidden group transition-colors duration-300 hover:bg-gold/[0.03]">
  {/* Gold top-border reveal on hover */}
  <div className="absolute top-0 left-0 right-0 h-0.5 bg-gold scale-x-0 group-hover:scale-x-100 transition-transform duration-400 ease-out-expo origin-left" />
  <div className="font-display text-[2.5rem] font-normal text-gold/15 group-hover:text-gold/30 transition-colors duration-300 leading-none mb-5">
    01
  </div>
  <h3 className="font-display text-[1.15rem] font-semibold text-warm-white leading-snug mb-3">
    Layered Access Tiers
  </h3>
  <p className="text-[0.88rem] font-light leading-[1.75] text-stone-light">
    Free browsing, platform subscriptions…
  </p>
</div>
```

##### Tier Card

```tsx
<div className="bg-ink p-8 relative">
  <div className="inline-block text-[0.62rem] font-medium tracking-[0.16em] uppercase text-gold bg-gold/12 px-[0.6rem] py-[0.25rem] rounded-sm mb-4">
    Author Subscriber
  </div>
  <div className="font-display text-[1.2rem] font-semibold text-warm-white mb-2">Patron</div>
  <p className="text-[0.85rem] font-light leading-[1.65] text-stone-light">
    Support a specific author and unlock their private section.
  </p>
  <ul className="mt-5 flex flex-col gap-2">
    {items.map(item => (
      <li key={item} className="text-[0.82rem] font-light text-stone-light flex items-start gap-2">
        <span className="text-gold/60 flex-shrink-0 mt-[0.05em]">—</span>
        {item}
      </li>
    ))}
  </ul>
</div>
```

##### Architecture Layer Card

```tsx
<div className="bg-ink-soft p-7">
  <div className="text-[0.62rem] tracking-[0.18em] uppercase text-gold opacity-70 mb-4 font-medium">
    Compute
  </div>
  <div className="flex flex-col gap-2">
    {items.map(item => (
      <div key={item} className={cn(
        "bg-white/[0.03] border rounded-sm px-3 py-2 font-mono text-[0.78rem] text-stone-light",
        "transition-all duration-200 hover:bg-gold/6 hover:border-gold/25 hover:text-parchment",
        item.accent ? "border-gold/25 text-parchment-dim" : "border-gold/10"
      )}>
        {item.label}
      </div>
    ))}
  </div>
</div>
```

##### Nav Bar

```tsx
<nav className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-10 py-5 bg-ink/82 backdrop-blur-xl border-b border-gold/12 transition-[padding] duration-300">
  {/* Logo mark */}
  <a href="/" className="flex items-center gap-2 no-underline">
    <div className="w-8 h-8 border border-[1.5px] border-gold rounded-md flex items-center justify-center font-display text-[0.95rem] text-gold font-semibold">
      D
    </div>
    <span className="font-display text-[1.1rem] font-semibold text-warm-white tracking-[0.02em]">
      Duseum
    </span>
  </a>
  {/* Links */}
  <ul className="flex items-center gap-8 list-none">
    <li><a href="/browse" className="text-[0.85rem] font-light text-stone-light uppercase tracking-[0.04em] hover:text-parchment transition-colors duration-200">Browse</a></li>
    <li><a href="/authors" className="text-[0.85rem] font-light text-stone-light uppercase tracking-[0.04em] hover:text-parchment transition-colors duration-200">Authors</a></li>
  </ul>
</nav>
```

##### Scroll Reveal Animation

Used on all below-the-fold content. Applied via `IntersectionObserver` in a `useReveal` hook:

```tsx
// frontend/src/hooks/useReveal.ts
import { useEffect, useRef } from 'react'

export const useReveal = () => {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add('visible'); io.disconnect() } },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return ref
}

// CSS in globals.css:
// .reveal { opacity: 0; transform: translateY(28px); transition: opacity 800ms cubic-bezier(0.16,1,0.3,1), transform 800ms cubic-bezier(0.16,1,0.3,1); }
// .reveal.visible { opacity: 1; transform: translateY(0); }
// .reveal-delay-1 { transition-delay: 100ms; }
// .reveal-delay-2 { transition-delay: 220ms; }
// .reveal-delay-3 { transition-delay: 360ms; }
// .reveal-delay-4 { transition-delay: 500ms; }
```

Usage:
```tsx
const ref = useReveal()
<section ref={ref} className="reveal">...</section>
// Or for staggered children, attach class directly and use the global IO from a context
```

##### Frame Ornament (Author Profile Visual)

The decorative museum-frame element used in the About section and Author profile pages:

```tsx
<div className="relative aspect-[4/5] bg-gold/[0.04] border border-gold/15 rounded-sm overflow-hidden flex items-center justify-center">
  {/* Inner inset border */}
  <div className="absolute inset-5 border border-gold/10 rounded-sm" />
  {/* Corner accents */}
  {['tl','tr','bl','br'].map(pos => (
    <div key={pos} className={cn('absolute w-5 h-5 border-gold/40', cornerClass(pos))} />
  ))}
  {/* Rotating ring ornament */}
  <div className="flex flex-col items-center gap-5 opacity-40">
    <div className="w-[72px] h-[72px] border border-[1.5px] border-gold rounded-full relative animate-rotate-slow">
      <div className="absolute inset-2 border border-dashed border-gold/40 rounded-full" />
    </div>
    <span className="font-display italic text-[0.85rem] text-gold tracking-[0.06em]">Duseum</span>
  </div>
</div>
```

#### 6.8.7 Page Layout Patterns

**Section alternation** (every page uses this rhythm):
```
<section className="py-28 px-8 bg-ink">           {/* Section A */}
<section className="py-28 px-8 bg-ink-soft border-t border-gold/10">  {/* Section B */}
<section className="py-28 px-8 bg-ink border-t border-gold/10">       {/* Section C */}
```

**Container max-width**:
```tsx
<div className="max-w-[1100px] mx-auto">...</div>
```

**Grid patterns**:
```
Feature grid (3 col):    grid grid-cols-3 gap-px bg-gold/10 border border-gold/10
Tier grid (2 col):       grid grid-cols-2 gap-px bg-gold/10
Architecture (4 col):    grid grid-cols-4 gap-px bg-gold/[0.08] border border-gold/10
About / Tiers (split):   grid grid-cols-[1fr_2fr] gap-20
```

**Responsive breakpoints** (standard Tailwind; no custom values):
```
sm: 640px  — single column; hide decorative visuals; collapse nav links
md: 768px  — (rarely used; jump from sm to lg)
lg: 1024px — restore multi-column grids (2-col → full)
```

**Page-level hero** (all major pages):
```tsx
<section className="relative min-h-screen flex flex-col items-center justify-center text-center px-8 pt-32 pb-24 overflow-hidden bg-ink">
  {/* Atmospheric glow */}
  <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(200,151,58,0.06) 0%, transparent 70%)' }} />
  {/* Grid texture */}
  <div className="absolute inset-0 pointer-events-none opacity-100" style={{ backgroundImage: 'linear-gradient(rgba(200,151,58,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(200,151,58,0.04) 1px, transparent 1px)', backgroundSize: '60px 60px', maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 0%, transparent 100%)' }} />
  {/* Content */}
  <div className="relative z-10">
    <EyebrowLabel>Digital Museum</EyebrowLabel>
    <h1 className="font-display text-[clamp(3.2rem,8vw,6.5rem)] font-normal leading-[1.08] tracking-[-0.02em] text-warm-white mb-1 animate-fade-up">
      Discover<br /><em className="italic text-gold-light">original art.</em>
    </h1>
  </div>
</section>
```

#### 6.8.8 Eyebrow Label Component

The flanked eyebrow element that appears above major headings:

```tsx
// frontend/src/components/ui/EyebrowLabel.tsx
export const EyebrowLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="inline-flex items-center gap-2 text-[0.72rem] font-medium tracking-[0.18em] uppercase text-gold mb-7">
    <span className="block w-7 h-px bg-gold opacity-60" />
    {children}
    <span className="block w-7 h-px bg-gold opacity-60" />
  </div>
)
```

#### 6.8.9 Artwork Display Rules

Art piece images are always displayed within a container that:
- Has `aspect-ratio: 4/5` for portrait pieces (default) or `16/9` for landscape if metadata indicates
- Has a `border border-gold/10` frame
- Uses `object-fit: cover` for thumbnails and `object-fit: contain` for detail view
- For **PRIVATE** pieces the caller cannot access: renders a blurred, dark-overlaid version of the thumbnail (if available) with a lock icon and "Subscribe to unlock" CTA — the actual image is never fetched
- Image URLs come from the API response (`imageUrl` for full-res, `thumbnailUrl` for grids); the frontend never constructs S3 or CloudFront URLs directly

#### 6.8.10 Notification & Status UI

**Access denied states** (PRIVATE piece, free-tier limit reached):
```tsx
// Overlay on blurred artwork
<div className="absolute inset-0 bg-ink/70 flex flex-col items-center justify-center gap-4 backdrop-blur-sm">
  <LockIcon className="text-gold w-8 h-8 opacity-70" />
  <p className="font-display italic text-parchment-dim text-sm text-center max-w-48">
    This piece is in the author's private section.
  </p>
  <button className="...btn-secondary...">Subscribe to unlock</button>
</div>
```

**Status indicators** (following the green dot pattern from the landing page footer):
```tsx
<div className="flex items-center gap-2">
  <div className="w-1.5 h-1.5 rounded-full bg-[#5a9e6e] animate-float" />
  <span className="text-[0.78rem] text-stone-light font-light opacity-70">Active</span>
</div>
```

**Tier access badge on artwork cards**:
```tsx
// Free-tier limit indicator
<span className="absolute top-3 right-3 text-[0.6rem] uppercase tracking-[0.14em] font-medium text-stone-light bg-ink/80 border border-gold/15 px-2 py-0.5 rounded-sm backdrop-blur-sm">
  Free preview
</span>
```

---

## 7. Security Architecture

### 7.1 Authentication Flow

```
User → Cognito Hosted UI / Custom Auth UI → Cognito User Pool
     → Access Token (JWT, 1hr TTL) + Refresh Token (30 days)
     → Frontend stores tokens in memory (access) + httpOnly cookie (refresh)

API Request:
  Frontend → Authorization: Bearer {accessToken} → API Gateway
          → API GW Cognito Authorizer validates token signature
          → If valid: invokes Lambda with decoded claims in event.requestContext.authorizer
          → Lambda reads: userId (sub), email, groups (for ADMIN check)
          → Lambda checks profile status in DynamoDB (ACTIVE required)
```

### 7.2 Authorization Layers

| Layer | What It Enforces |
|---|---|
| **API Gateway Cognito Authorizer** | Valid, non-expired JWT on all non-public routes |
| **Lambda middleware** | Profile status (ACTIVE), profile type (Author vs Viewer) |
| **Repository layer** | Resource ownership (e.g., only the Author can edit their own piece) |
| **Access control module** | Art piece visibility + subscription tier checks |

### 7.3 Private Content Security

Private art pieces (`visibility = PRIVATE`) are never served via public CloudFront URLs. The Lambda generates a **CloudFront signed URL** with a 1-hour TTL using an RSA key pair stored in Secrets Manager. The S3 bucket only allows access via CloudFront OAC (Origin Access Control) — direct S3 access is blocked.

```
S3 bucket policy: only CloudFront OAC principal can read objects
CloudFront: requires signed URL for all private/* prefix paths
Lambda: generates signed URL on access-authorized requests only
```

### 7.4 Stripe Webhook Security

Stripe webhook events are verified using `stripe.webhooks.constructEvent()` with the webhook signing secret. The verification happens in `subscriptions-webhook-lambda` before any processing. Events that fail signature verification are logged and dropped (not retried) — signature failures indicate forgery, not transient errors.

**Two webhook endpoints, same URL.** Duseum registers two separate Stripe webhook endpoints both pointing to `POST /webhooks/stripe`:

1. **Connect webhook** (`duseum/{env}/stripe/webhook-secret`) — "Events from: Connected and v2 accounts" — receives only `account.updated` from Express-connected accounts.
2. **Account webhook** (`duseum/{env}/stripe/webhook-secret-account`) — "Events from: Your account" — receives platform events: `payment_intent.*`, `customer.subscription.*`, `invoice.*`.

Since the Lambda cannot know which endpoint delivered a given message, it tries the Account secret first (covers the majority of events), then falls back to the Connect secret on `StripeSignatureVerificationError`. Both secrets are cached module-level in `packages/shared/src/secrets.ts`.

### 7.5 WAF Rules

**WAF is intentionally disabled** (cost optimisation). No `CfnWebACL` is attached to either CloudFront distribution. See NFR-SEC-06.

Note: WAF REGIONAL cannot be associated with API Gateway HTTP API v2 regardless — `CfnWebACLAssociation` rejects the `/apis/{id}/stages/$default` ARN format. API-layer protection is provided by the mechanisms below.

**Active protections:**

| Layer | Protection | Mechanism |
|---|---|---|
| CloudFront | HTTPS enforcement | `viewerProtocolPolicy: redirect-to-https` |
| CloudFront | TLS minimum | `minimumProtocolVersion: TLSv1.2_2021` |
| CloudFront (SPA) | Security headers | `SecurityHeaders` managed response-headers policy |
| API Gateway | Authentication | Cognito JWT authorizer on all non-public routes |
| API Gateway | Rate limiting | Stage-level default throttling |

---

## 8. API Documentation

All routes are prefixed with `/api/v1`. API Gateway HTTP API with Cognito JWT authorizer.

### 8.1 Auth Header Convention

```
Public routes (no JWT):     GET /artworks (free-tier list), GET /artworks/{id} (free-tier)
                            GET /features/daily, GET /features/weekly (homepage data)
                            GET /features/weekly/availability (booking calendar)
Protected routes (JWT):     All write operations; subscription checks; Author dashboard
                            POST /features/weekly/book (Author only)
Admin routes (ADMIN group):  /admin/*
```

### 8.2 Art Pieces

#### `GET /artworks`
List public art pieces (global browse). Applies free-tier limit for unauthenticated and free-tier users.

**Query params**: `tag`, `category`, `authorId`, `sort` (newest|trending|mostViewed), `limit` (default: 20, max: 50), `cursor`

**Response `200`**:
```json
{
  "items": [
    {
      "artworkId": "uuid",
      "title": "Sunset",
      "authorId": "uuid",
      "authorDisplayName": "Jane Doe",
      "category": "PAINTING",
      "tags": ["landscape", "oil"],
      "thumbnailUrl": "https://media.duseum.com/...",
      "viewCount": 1024,
      "reactionCounts": { "LOVE": 42, "FIRE": 11 },
      "commentCount": 7,
      "publishedAt": "2025-01-15T12:00:00Z",
      "accessTier": "PUBLIC"
    }
  ],
  "nextCursor": "eyJQSyI6...",
  "totalVisible": 120
}
```

---

#### `GET /artworks/{artworkId}`
Get a single art piece. Returns signed URL for private pieces if caller has access.

**Response `200`**:
```json
{
  "artworkId": "uuid",
  "title": "Midnight Garden",
  "description": "An exploration of...",
  "authorId": "uuid",
  "authorDisplayName": "Jane Doe",
  "category": "DIGITAL",
  "tags": ["dark", "fantasy"],
  "imageUrl": "https://media.duseum.com/...",  // signed if PRIVATE
  "imageUrlExpiresAt": "2025-01-15T13:00:00Z",   // present if signed
  "visibility": "PRIVATE",
  "viewCount": 88,
  "reactionCounts": { "LOVE": 15 },
  "viewerReaction": "LOVE",
  "commentCount": 3,
  "commentsEnabled": true,
  "notifiedCount": 124,
  "publishedAt": "2025-01-10T09:00:00Z"
}
```
**Response `402`** (private, not subscribed):
```json
{
  "error": {
    "code": "PAYMENT_REQUIRED",
    "message": "This piece is in the author's private section.",
    "subscribeUrl": "/authors/uuid/subscribe"
  }
}
```

---

#### `POST /artworks` 🔒 Author only
Create a new art piece (requires `s3Key` from a completed upload intent).

**Request body**:
```json
{
  "s3Key": "3f7a1b2c-...",
  "title": "My New Piece",
  "description": "Optional description",
  "category": "ILLUSTRATION",
  "tags": ["fantasy", "character"],
  "visibility": "PUBLIC",
  "commentsEnabled": true
}
```
**Response `201`**: Art piece object.

---

#### `PUT /artworks/{artworkId}` 🔒 Author only (own pieces)
Update metadata or visibility.

**Request body** (all fields optional):
```json
{
  "title": "Updated Title",
  "description": "...",
  "tags": ["updated", "tags"],
  "visibility": "PRIVATE",
  "commentsEnabled": false
}
```

---

#### `DELETE /artworks/{artworkId}` 🔒 Author only (own pieces)
Archive (soft delete) an art piece. Use `?permanent=true` to permanently delete (removes S3 object).

---

### 8.3 Media Upload

#### `POST /media/upload-intent` 🔒 Author only
Get a presigned S3 URL for uploading an art piece image.

**Request body**:
```json
{
  "fileName": "painting.jpg",
  "mimeType": "image/jpeg",
  "sizeBytes": 4096000
}
```
**Response `200`**:
```json
{
  "intentId": "uuid",
  "uploadUrl": "https://duseum-dev-s3-media.s3.amazonaws.com/...",
  "s3Key": "3f7a1b2c-...",
  "expiresAt": "2025-01-15T12:10:00Z"
}
```

---

### 8.4 User Profiles

#### `GET /users/me` 🔒
Get current user account + both profiles.

#### `GET /users/{userId}/profile` (public)
Get a user's public Author profile page data (Author display name, bio, public gallery preview).

#### `PUT /users/me/viewer` 🔒
Update Viewer profile settings (display name, notification preferences).

#### `POST /users/me/author` 🔒
Create Author profile (onboarding). Triggers Author profile creation flow.

**Request body**:
```json
{
  "displayName": "Jane Doe",
  "bio": "Illustrator based in NYC.",
  "authorSubscriptionPriceUsd": 5.00
}
```

#### `PUT /users/me/author` 🔒 Author only
Update Author profile.

---

### 8.5 Authors

#### `GET /authors` (public)
Browse Author directory. **Query params**: `sort` (subscriberCount|newest), `limit`, `cursor`

#### `GET /authors/{authorId}` (public)
Get Author public profile + paginated public gallery.

#### `GET /authors/{authorId}/collections` (public)
List Author's public collections.

---

### 8.6 Subscriptions

#### `GET /subscriptions/me` 🔒
Get caller's active subscriptions (platform + all Author subscriptions).

#### `POST /subscriptions/platform` 🔒
Create Stripe Checkout session for platform subscription.

**Response `200`**:
```json
{ "checkoutUrl": "https://checkout.stripe.com/..." }
```

#### `POST /subscriptions/authors/{authorId}` 🔒
Create Stripe Checkout session for Author subscription.

#### `POST /subscriptions/portal` 🔒
Create Stripe Billing Portal session (manage/cancel subscriptions).

**Response `200`**:
```json
{ "portalUrl": "https://billing.stripe.com/..." }
```

---

### 8.7 Social

#### `GET /artworks/{artworkId}/comments` (public for accessible pieces)
List comments on an art piece. **Query params**: `limit`, `cursor`

#### `POST /artworks/{artworkId}/comments` 🔒
Post a comment.
```json
{ "body": "Beautiful work!", "parentCommentId": null }
```

#### `DELETE /comments/{commentId}` 🔒 Author (own piece) or comment author
Delete own comment (or Author deletes comment on their piece).

#### `PUT /artworks/{artworkId}/reactions` 🔒
Upsert a reaction (replaces previous reaction).
```json
{ "reactionType": "LOVE" }
```

#### `DELETE /artworks/{artworkId}/reactions` 🔒
Remove reaction.

---

### 8.8 Follows & Notification Preferences

#### `POST /follows/authors/{authorId}` 🔒
Follow an Author. Opts the Viewer in to new-piece email notifications using their `defaultNotificationPref` (unless a per-Author override already exists).

**Response `200`**:
```json
{
  "authorId": "uuid",
  "followedAt": "2025-08-05T10:00:00Z",
  "notificationPref": "ALL_NEW_PIECES"
}
```
**Response `409`**: Already following this Author.

---

#### `DELETE /follows/authors/{authorId}` 🔒
Unfollow an Author. Immediately stops both feed surfacing and email notifications for that Author. Per-Author `NotificationPreference` record is deleted.

**Response `200`**:
```json
{ "authorId": "uuid", "unfollowedAt": "2025-08-05T10:05:00Z" }
```

---

#### `GET /follows/authors` 🔒
List Authors the caller follows, including notification preference per Author.

**Query params**: `limit` (default: 20, max: 50), `cursor`

**Response `200`**:
```json
{
  "items": [
    {
      "authorId": "uuid",
      "displayName": "Jane Doe",
      "profilePhotoUrl": "https://media.duseum.com/...",
      "followedAt": "2025-07-01T09:00:00Z",
      "notificationPref": "ALL_NEW_PIECES"
    }
  ],
  "nextCursor": "eyJQSyI6..."
}
```

---

#### `GET /users/me/notification-preferences` 🔒
Get the caller's global notification settings and all per-Author overrides.

**Response `200`**:
```json
{
  "globalOptOut": false,
  "defaultPref": "ALL_NEW_PIECES",
  "perAuthorOverrides": [
    {
      "authorId": "uuid",
      "displayName": "Marco Rivera",
      "pref": "PUBLIC_ONLY",
      "updatedAt": "2025-07-20T14:00:00Z"
    }
  ]
}
```

---

#### `PUT /users/me/notification-preferences` 🔒
Update global notification settings and/or per-Author overrides. All fields optional; only provided fields are updated.

**Request body**:
```json
{
  "globalOptOut": false,
  "defaultPref": "ALL_NEW_PIECES",
  "perAuthorOverrides": [
    { "authorId": "uuid", "pref": "NONE" }
  ]
}
```
**Response `200`**: Updated preferences object (same shape as GET response).

---

#### `GET /notifications/unsubscribe` (public — no JWT)
One-click unsubscribe from a specific Author's notifications. Called when a Viewer clicks the unsubscribe link in a notification email. The `token` query param is a signed JWT (TTL: 30 days) encoding `{ viewerId, authorId }`.

**Query params**: `token` (required)

**Response `200`**:
```json
{
  "message": "You have been unsubscribed from new-piece notifications for Jane Doe.",
  "authorId": "uuid",
  "authorDisplayName": "Jane Doe"
}
```
**Response `400`**: Token missing, expired, or tampered.

---

### 8.9 Featured Authors

#### `GET /features/daily` (public)
Get today's Daily Featured Author. Returns the Author's profile and spotlight data. Cached at CloudFront (TTL: 1 hour — rotates daily so short cache is acceptable).

**Response `200`**:
```json
{
  "date": "2025-08-05",
  "author": {
    "authorId": "uuid",
    "displayName": "Jane Doe",
    "bio": "Illustrator based in NYC...",
    "coverPhotoUrl": "https://media.duseum.com/...",
    "followerCount": 412,
    "subscriberCount": 38,
    "authorSubscriptionMonthlyUsd": 5.00
  },
  "spotlightPieces": [
    {
      "artworkId": "uuid",
      "title": "Midnight Garden",
      "thumbnailUrl": "https://media.duseum.com/...",
      "category": "DIGITAL"
    }
  ],
  "selectionMethod": "RANDOM"
}
```

---

#### `GET /features/weekly` (public)
Get the current week's Weekly Featured Authors (up to `slotsTotal` from config). Order is randomized per response to prevent positional advantage (FR-FEAT-16). The frontend must use the `slotsTotal` field from the response — never a hardcoded constant.

**Query params**: `week` (optional ISO week string `YYYY-Www`; defaults to current week)

**Response `200`**:
```json
{
  "isoWeek": "2025-W32",
  "weekStartDate": "2025-08-04",
  "weekEndDate": "2025-08-10",
  "slotsFilled": 2,
  "slotsTotal": 3,
  "featuredAuthors": [
    {
      "authorId": "uuid",
      "displayName": "Marco Rivera",
      "coverPhotoUrl": "https://media.duseum.com/...",
      "recentPieces": [
        { "artworkId": "uuid", "title": "...", "thumbnailUrl": "..." },
        { "artworkId": "uuid", "title": "...", "thumbnailUrl": "..." }
      ]
    }
  ]
}
```

---

#### `GET /features/weekly/availability` (public)
Get the booking availability calendar for the next 8 weeks. Shows slot counts per week so Authors can choose which week to book.

**Response `200`**:
```json
{
  "weeks": [
    {
      "isoWeek": "2025-W33",
      "weekStartDate": "2025-08-11",
      "weekEndDate": "2025-08-17",
      "slotsTotal": 3,
      "slotsAvailable": 1,
      "isAvailable": true
    },
    {
      "isoWeek": "2025-W34",
      "weekStartDate": "2025-08-18",
      "weekEndDate": "2025-08-24",
      "slotsTotal": 3,
      "slotsAvailable": 0,
      "isAvailable": false
    }
  ],
  "feeFeeUsd": 25.00
}
```

---

#### `POST /features/weekly/book` 🔒 Author only
Book a paid weekly feature slot. Creates a Stripe Payment Intent and reserves a slot atomically on payment success.

**Request body**:
```json
{ "isoWeek": "2025-W33" }
```

**Response `200`** (payment intent created; frontend completes payment):
```json
{
  "bookingId": "uuid",
  "isoWeek": "2025-W33",
  "weekStartDate": "2025-08-11",
  "weekEndDate": "2025-08-17",
  "amountUsd": 25.00,
  "stripeClientSecret": "pi_xxx_secret_xxx",
  "status": "PENDING_PAYMENT"
}
```

**Response `409`** (Author already has a booking within 3-month window):
```json
{
  "error": {
    "code": "CONFLICT",
    "message": "You already have a weekly feature booking within the last 3 months.",
    "existingBooking": {
      "isoWeek": "2025-W20",
      "weekStartDate": "2025-05-12",
      "eligibleAgainAfter": "2025-08-12"
    }
  }
}
```

**Response `409`** (week is fully booked):
```json
{
  "error": {
    "code": "CONFLICT",
    "message": "No slots available for week 2025-W33. Please choose a different week."
  }
}
```

---

#### `GET /features/weekly/my-bookings` 🔒 Author only
Get the calling Author's full booking history (upcoming and past).

**Response `200`**:
```json
{
  "items": [
    {
      "bookingId": "uuid",
      "isoWeek": "2025-W33",
      "weekStartDate": "2025-08-11",
      "weekEndDate": "2025-08-17",
      "featureStatus": "CONFIRMED",
      "amountPaidUsd": 25.00,
      "bookedAt": "2025-07-15T10:22:00Z"
    }
  ],
  "nextEligibleWeek": "2025-W47"
}
```

---

### 8.10 Admin

All admin routes require `ADMIN` Cognito group membership.

#### `GET /admin/users` 🔒 Admin
List users with filters.

#### `PUT /admin/users/{userId}/suspend` 🔒 Admin
Suspend a user account (disables all profiles).

#### `DELETE /admin/artworks/{artworkId}` 🔒 Admin
Remove an art piece (policy violation).

#### `PUT /admin/config` 🔒 Admin
Update platform config (free tier limit, subscription price ID, weekly feature fee, slot count, featured authors).

**Request body** (all fields optional):
```json
{
  "freeTierLimit": 10,
  "platformSubPriceId": "price_xxx",
  "platformCutPercent": 20,
  "weeklyFeatureFeeUsd": 25,
  "weeklyFeatureSlotCount": 10,
  "weeklyFeatureAdvanceWeeks": 8
}
```

#### `PUT /admin/features/daily/override` 🔒 Admin
Override today's Daily Featured Author with a specific Author.

**Request body**:
```json
{ "authorId": "uuid" }
```

**Response `200`**:
```json
{
  "date": "2025-08-05",
  "authorId": "uuid",
  "overriddenBy": "admin-uuid",
  "previousAuthorId": "uuid"
}
```

#### `DELETE /admin/features/weekly/bookings/{bookingId}` 🔒 Admin
Cancel a confirmed or active weekly feature booking and issue a full Stripe refund. The freed slot becomes immediately available (FR-ADMIN-07).

**Request body**:
```json
{ "reason": "Policy violation — inappropriate content." }
```

**Response `200`**:
```json
{
  "bookingId": "uuid",
  "featureStatus": "CANCELLED",
  "refundId": "re_xxx",
  "cancelledAt": "2025-08-05T14:00:00Z"
}
```

#### `GET /admin/features/weekly` 🔒 Admin
List all weekly feature bookings across all weeks, with filters.

**Query params**: `week` (ISO week), `status` (CONFIRMED|ACTIVE|ARCHIVED|CANCELLED), `limit`, `cursor`

---

## 9. DevOps & Deployment

### 9.1 Environments

| Environment | Branch | AWS Account | Domain |
|---|---|---|---|
| `dev` | `develop` | `duseum-dev` | `dev.duseum.com` |
| `prod` | `v*.*.*` tag | `duseum-prod` | `duseum.com` |

Two environments only. No QA/staging environment — integration tests via local emulation (see Section 16).

### 9.2 CI/CD Strategy

**Principle**: Build Lambda bundles once per commit. Deploy the same artifact to dev, then promote to prod with a manual approval gate.

**Environment resolution** (in every workflow):
```bash
if   [[ "${GITHUB_REF}" == refs/tags/v* ]]; then ENV=prod
elif [[ -n "${{ inputs.environment }}" ]];   then ENV=${{ inputs.environment }}
else                                               ENV=dev
fi
```

**Image/artifact tagging convention**:
```
Lambda ZIP: duseum-{lambda-name}-{github.sha}.zip
CDK asset:  {github.sha}  (passed as CDK context variable)
```

### 9.3 Workflow Inventory

#### PR / CI Workflows

| Workflow | Trigger | Scope |
|---|---|---|
| `ci.yml` | PR to `develop` or `main` | Lint, typecheck, unit tests, CDK synth validate |
| `ci-frontend.yml` | PR touching `frontend/**` | Lint, typecheck, Vitest unit tests, build validate |
| `ci-infra.yml` | PR touching `infrastructure/**` | `cdk synth` (both envs), TypeScript compile |

#### Deploy Workflows

| Workflow | Trigger | Pipeline shape |
|---|---|---|
| `deploy-dev.yml` | Push to `develop` | CI → [Build ∥ Bootstrap Check] → Deploy → Deploy Frontend → Dep Check → Smoke Test |
| `deploy-prod.yml` | Tag `v*.*.*` | CI → [Build ∥ Bootstrap Check] → manual approval → Deploy → Deploy Frontend → Dep Check → Smoke Test |

#### Reusable Workflows

| Workflow | Purpose |
|---|---|
| `_build-lambdas.yml` | Build all Lambda ZIPs with esbuild, upload to S3 artifact bucket |
| `_cdk-deploy.yml` | Run `cdk deploy --all` for a given environment, reading artifact ZIPs from S3 |
| `_pre-deploy-check.yml` | Bootstrap prerequisites check — verifies bootstrap.sh outputs exist before CDK deploy |
| `_dep-check.yml` | Runtime dependency check — verifies config table seeded, secrets present, Stripe price active |
| `_deploy-frontend.yml` | Build and deploy frontend SPA to S3 + CloudFront invalidation |

### 9.4 Reusable Workflow — `_build-lambdas.yml`

Builds all Lambda functions with esbuild (tree-shaken, bundled, minified). Uploads ZIPs to the shared CI/CD artifact bucket. Called by both `deploy-dev.yml` and `deploy-prod.yml`.

**Artifact bucket**: `duseum-cicd-artifacts` — pre-provisioned shared bucket (not environment-specific). Both dev and prod pipelines upload to this bucket, namespaced by environment in the S3 key path.

**S3 path convention**:
```
duseum-cicd-artifacts/{env}/lambda/{sha}/{name}/function.zip
duseum-cicd-artifacts/{env}/api-gateway/{sha}/...
duseum-cicd-artifacts/{env}/misc/{sha}/...
```

The `{env}/` prefix provides logical isolation between dev and prod artifacts within the shared bucket. Lifecycle rules should be configured to expire objects under each prefix independently (e.g., dev artifacts expire after 7 days; prod artifacts after 30 days).

```yaml
# .github/workflows/_build-lambdas.yml
on:
  workflow_call:
    inputs:
      sha:         { type: string, required: true }
      environment: { type: string, required: true }   # dev | prod — sets S3 key prefix and OIDC env
    outputs:
      artifact-bucket: { value: ${{ jobs.build.outputs.artifact-bucket }} }

jobs:
  build:
    runs-on: ubuntu-latest
    environment: ${{ inputs.environment }}            # OIDC sub claim must match role trust policy
    permissions:
      id-token: write
      contents: read
    outputs:
      artifact-bucket: ${{ steps.upload.outputs.bucket }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: npm }
      - run: npm ci
      - run: npm run build:lambdas   # turborepo builds all lambdas in parallel
      # Each lambda outputs a ZIP to dist/lambdas/{name}/function.zip
      - id: upload
        run: |
          BUCKET="duseum-cicd-artifacts"
          ENV="${{ inputs.environment }}"
          SHA="${{ inputs.sha }}"
          for ZIP in dist/lambdas/*/function.zip; do
            NAME=$(basename $(dirname $ZIP))
            aws s3 cp $ZIP s3://$BUCKET/$ENV/lambda/$SHA/$NAME/function.zip
          done
          echo "bucket=$BUCKET" >> $GITHUB_OUTPUT
```

### 9.5 Reusable Workflow — `_cdk-deploy.yml`

```yaml
# .github/workflows/_cdk-deploy.yml
on:
  workflow_call:
    inputs:
      environment: { type: string, required: true }
      sha:         { type: string, required: true }
    secrets:
      AWS_ROLE_ARN: { required: true }

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: ${{ inputs.environment }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: npm }
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: us-east-1
      - run: npm ci
      - name: CDK Deploy
        run: |
          cd infrastructure
          npx cdk deploy --all \
            --context env=${{ inputs.environment }} \
            --context sha=${{ inputs.sha }} \
            --require-approval never
        env:
          AWS_ACCOUNT_ID: ${{ secrets.AWS_ACCOUNT_ID }}
```

### 9.6 Deploy Workflow — `deploy-dev.yml`

> **Source of truth**: `.github/workflows/deploy-dev.yml` is authoritative. The snippet below illustrates structure only — read the actual file before making changes.

```yaml
# .github/workflows/deploy-dev.yml
name: Deploy — dev
on:
  push:
    branches: [develop]
  workflow_dispatch:
    inputs:
      environment: { type: choice, options: [dev], default: dev }

jobs:
  ci:
    uses: ./.github/workflows/ci.yml
    secrets: inherit

  build:
    needs: ci
    uses: ./.github/workflows/_build-lambdas.yml
    with:
      sha: ${{ github.sha }}
    secrets: inherit

  deploy:
    needs: build
    uses: ./.github/workflows/_cdk-deploy.yml
    with:
      environment: dev
      sha: ${{ github.sha }}
    secrets:
      AWS_ROLE_ARN: ${{ secrets.AWS_ROLE_ARN_DEPLOY_DEV }}
      AWS_ACCOUNT_ID: ${{ secrets.AWS_ACCOUNT_ID_DEV }}

  smoke-test:
    needs: deploy-frontend
    runs-on: ubuntu-latest
    environment: dev
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN_DEPLOY_DEV }}
          aws-region: us-east-1
      - name: Run smoke tests
        run: bash scripts/smoke-test.sh dev ${{ github.sha }}
        # Runs pytest (scripts/smoke_tests/test_smoke.py); uploads JSON results to
        # s3://duseum-cicd-artifacts/dev/smoke-tests/{sha}.results.json
```

### 9.7 Deploy Workflow — `deploy-prod.yml`

> **Source of truth**: `.github/workflows/deploy-prod.yml` is authoritative. The snippet below illustrates structure only — read the actual file before making changes.

```yaml
# .github/workflows/deploy-prod.yml
name: Deploy — prod
on:
  push:
    tags: ['v*.*.*']
  workflow_dispatch:
    inputs:
      environment: { type: choice, options: [prod], required: true }

jobs:
  ci:
    uses: ./.github/workflows/ci.yml
    secrets: inherit

  build:
    needs: ci
    uses: ./.github/workflows/_build-lambdas.yml
    with:
      sha: ${{ github.sha }}
    secrets: inherit

  deploy-prod:
    needs: build
    uses: ./.github/workflows/_cdk-deploy.yml
    with:
      environment: prod
      sha: ${{ github.sha }}
    secrets:
      AWS_ROLE_ARN: ${{ secrets.AWS_ROLE_ARN_DEPLOY_PROD }}
      AWS_ACCOUNT_ID: ${{ secrets.AWS_ACCOUNT_ID_PROD }}
    # GitHub Environment "prod" has required reviewers configured — this job
    # will pause for manual approval before running.

  smoke-test:
    needs: deploy-frontend
    runs-on: ubuntu-latest
    environment: prod
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN_DEPLOY_PROD }}
          aws-region: us-east-1
      - name: Run smoke tests
        run: bash scripts/smoke-test.sh prod ${{ github.sha }}
        # Runs pytest (scripts/smoke_tests/test_smoke.py); uploads JSON results to
        # s3://duseum-cicd-artifacts/prod/smoke-tests/{sha}.results.json
```

### 9.8 Dependency Health Checks — `_pre-deploy-check.yml` and `_dep-check.yml`

The pipeline has two dedicated verification jobs that catch a class of failure invisible to CDK and CI: **missing runtime data dependencies** (bootstrap prerequisites not provisioned, config table not seeded, Stripe prices not created).

#### Dependency categories

| Category | Created by | Verified by |
|---|---|---|
| Code dependencies | `npm install` | CI (lint, typecheck, tests) |
| AWS infrastructure | CDK deploy | CDK synth + deploy success |
| Bootstrap prerequisites | `scripts/bootstrap.sh` | `_pre-deploy-check.yml` (pre-deploy) |
| Runtime data | `scripts/bootstrap.sh` | `_dep-check.yml` (post-deploy) |

#### `_pre-deploy-check.yml` — Bootstrap prerequisites check (shift-left, parallel with Build)

**Position**: Runs in parallel with `Build`, both needing only `[ci]`. Deploy gates on both. Zero latency overhead when passing.

**Script**: `scripts/pre-deploy-check.sh {env}`

**What it checks** (things `bootstrap.sh` creates, NOT things CDK creates):

| Check | Expected |
|---|---|
| S3 bucket `duseum-cicd-artifacts` | Exists (head-bucket) |
| Secrets Manager: `duseum/{env}/stripe/secret-key` | Exists |
| Secrets Manager: `duseum/{env}/stripe/webhook-secret` | Exists |
| Secrets Manager: `duseum/{env}/stripe/webhook-secret-account` | Exists |
| Secrets Manager: `duseum/{env}/stripe/connect-client-id` | Exists |
| Secrets Manager: `duseum/{env}/cloudfront/private-key` | Exists |
| Secrets Manager: `duseum/{env}/notifications/unsubscribe-secret` | Exists |
| Secrets Manager: `duseum/{env}/ses/from-address` | Exists |
| SSM: `/duseum/{env}/cloudfront/key_pair_id` | Exists |
| SSM: `/duseum/{env}/stripe/platform_price_id` | Exists |
| IAM role: `duseum-github-actions-deploy-{env}` | Exists |
| IAM role: `duseum-github-actions-build` | Exists |

**What it does NOT check** (CDK manages these):
- DynamoDB tables, SQS queues, Lambda functions, API Gateway — these don't exist until CDK deploys and should not block a CDK deploy.

**Failure message**: "Run `bash scripts/bootstrap.sh` to provision missing prerequisites."

#### `_dep-check.yml` — Runtime dependency check (post-deploy, gates smoke tests)

**Position**: Runs after `Deploy Frontend`. Smoke Test gates on `dep-check`. This ensures all three dependency categories are healthy before treating the deployment as green.

**Script**: `scripts/dep-check.sh {env}`

**Smart failure logic** (distinguishes acceptable-absent vs real-failure):

| Condition | `describe-table` result | Meaning | Action |
|---|---|---|---|
| Table exists, key present, real value | Success | Healthy | ✅ Pass |
| Table exists, key missing | Success | bootstrap.sh §3.6 not run | ❌ Fail: seed config table |
| Table exists, key is placeholder `REPLACE_WITH_*` | Success | bootstrap.sh §3.7 incomplete | ❌ Fail: run bootstrap.sh |
| Table missing | `ResourceNotFoundException` | CDK deploy may have failed | ❌ Fail: re-run CDK deploy |

**Config table keys checked** (all must be present and non-placeholder):

| Key | Expected |
|---|---|
| `PLATFORM_SUB_PRICE_ID` | Stripe Price ID `price_*` |
| `PLATFORM_CUT_PERCENT` | `20` |
| `FREE_TIER_LIMIT` | `5` |
| `WEEKLY_FEATURE_FEE_USD` | `50` |
| `WEEKLY_FEATURE_SLOT_COUNT` | `3` |
| `WEEKLY_FEATURE_ADVANCE_WEEKS` | `3` |

**Additional checks**:
- 7 Secrets Manager secrets (same set as pre-deploy-check) — existence only
- Stripe price `PLATFORM_SUB_PRICE_ID` value → Stripe API `GET /v1/prices/{id}` → status must be `active`

#### Reusable workflow interface

Both `_pre-deploy-check.yml` and `_dep-check.yml` share the same interface:

```yaml
on:
  workflow_call:
    inputs:
      environment: { required: true, type: string }   # dev | prod — never hardcoded inside
    secrets:
      AWS_ROLE_ARN: { required: true }
jobs:
  check:
    runs-on: ubuntu-latest
    environment: ${{ inputs.environment }}
    permissions:
      id-token: write
      contents: read
```

**OIDC requirement**: The `environment:` and `permissions: id-token: write` declarations are mandatory — the OIDC role trust policy checks the sub claim for `environment:{env}`.

#### Adding new runtime data dependencies

When a new feature requires a new config table key or a new external resource:

1. Add the key to `REQUIRED_KEYS` array in `scripts/dep-check.sh`
2. Add provisioning logic to `scripts/bootstrap.sh` (idempotent, re-runnable)
3. Add a row to the config table keys table in `CLAUDE.md` and this section
4. Update `specs/infrastructure/environment-bootstrap.md` with done-when items for seeding both dev and prod

---

## 10. Project Configuration & Setup

### 10.1 Technology Stack

| Layer | Technology | Version | Notes |
|---|---|---|---|
| **Frontend** | React + TypeScript | 18 + TS 5 | Vite build, Tailwind CSS, React Query, Zustand |
| **Lambda runtime** | Node.js | 20 LTS | All Lambda functions |
| **Lambda language** | TypeScript | 5.x | Compiled + bundled with esbuild |
| **Lambda framework** | Middy | 5.x | Middleware layer (no Express, no NestJS, no Hono) |
| **Database** | DynamoDB | On-demand | Single-table design |
| **Auth** | Amazon Cognito | — | User Pool + JWT |
| **Payments** | Stripe | Latest | Billing + Connect Express |
| **CDN / Storage** | CloudFront + S3 | — | Media delivery, signed URLs |
| **Messaging** | SQS | — | Stripe webhook queue + DLQ |
| **Infrastructure** | AWS CDK | 2.x (TypeScript) | All infra as code |
| **Local AWS emulator** | MiniStack (`nahuelnucera/ministack`) | Latest | DynamoDB, S3, SQS, SES, Secrets Manager — free, MIT-licensed, no account required |
| **Monorepo** | npm workspaces + Turborepo | — | Shared packages + parallel builds |
| **CI/CD** | GitHub Actions + OIDC | — | No static AWS keys |
| **Local AWS** | MiniStack | Latest | Local DynamoDB, S3, SQS, SES, Secrets Manager emulation |

### 10.2 Repository Setup

```bash
# Clone
git clone https://github.com/{org}/duseum.git
cd duseum

# Install all workspace dependencies
npm install

# Verify workspace packages are linked
npm run build --workspace=packages/shared
```

### 10.3 Environment Variables

Lambda functions read config from environment variables set by CDK (sourced from Secrets Manager and SSM at deploy time — never hardcoded):

```
ENVIRONMENT            # dev | prod
DYNAMODB_TABLE_NAME    # duseum-{env}-dynamodb-main
IDEMPOTENCY_TABLE_NAME # duseum-{env}-dynamodb-idempotency
CONFIG_TABLE_NAME      # duseum-{env}-dynamodb-config
S3_MEDIA_BUCKET        # duseum-{env}-s3-media
CLOUDFRONT_MEDIA_DOMAIN # media.duseum.com (or media.dev.duseum.com)
CLOUDFRONT_KEY_PAIR_ID  # Read from Secrets Manager at runtime
STRIPE_SECRET_KEY       # Read from Secrets Manager at runtime (never env var)
STRIPE_WEBHOOK_QUEUE_URL # duseum-{env}-sqs-stripe-webhooks (for webhook lambda)
COGNITO_USER_POOL_ID
COGNITO_CLIENT_ID
APP_BASE_URL           # https://duseum.com (prod) | https://dev.duseum.com (dev) — used for Stripe Connect return/refresh URLs
# maintenance-lambda only:
DAILY_FEATURE_RULE_NAME  # duseum-{env}-eventbridge-daily-featured-author
WEEKLY_ROTATION_RULE_NAME # duseum-{env}-eventbridge-weekly-feature-rotation
```

**Secrets are always read from Secrets Manager at Lambda cold start**, never injected as env vars. Use `@aws-sdk/client-secrets-manager` with a module-level cache:

```typescript
// packages/shared/src/secrets.ts
let _stripeKey: string | undefined
export const getStripeKey = async (): Promise<string> => {
  if (_stripeKey) return _stripeKey
  const sm = new SecretsManagerClient({})
  const result = await sm.send(new GetSecretValueCommand({
    SecretId: `duseum/${process.env.ENVIRONMENT}/stripe/secret-key`
  }))
  _stripeKey = result.SecretString!
  return _stripeKey
}
```

### 10.4 Turbo Pipeline Config

```json
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "build:lambdas": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "lint": {},
    "typecheck": { "dependsOn": ["^build"] },
    "test": { "dependsOn": ["^build"] }
  }
}
```

---

## 11. Infrastructure Bootstrap Guide

### 11.1 Overview

`scripts/bootstrap.sh` is the **single authoritative provisioning script** for all external resources that CDK cannot manage. Run it once before the first CDK deploy (and re-run idempotently whenever prerequisites need refreshing). The pipeline's `_pre-deploy-check.yml` job verifies its outputs before every CDK deploy.

**What `bootstrap.sh` provisions** (idempotent — safe to re-run):

| Section | What |
|---|---|
| §1 | Dev Stripe keys → Secrets Manager |
| §2 | Prod Stripe keys → Secrets Manager |
| §3 | Stripe publishable keys → SSM Parameter Store |
| §3.5 | CI/CD S3 artifact bucket `duseum-cicd-artifacts` |
| §3.6 | DynamoDB config table rows (static keys: `PLATFORM_CUT_PERCENT`, `FREE_TIER_LIMIT`, `WEEKLY_FEATURE_FEE_USD`, `WEEKLY_FEATURE_SLOT_COUNT`, `WEEKLY_FEATURE_ADVANCE_WEEKS`) |
| §3.7 | Stripe platform subscription product + price ($10/month), seeds `PLATFORM_SUB_PRICE_ID` into config table |
| §4 | CloudFront RSA key pairs + key groups |
| §5 | GitHub Actions OIDC provider |
| §6 | GitHub Actions IAM deploy roles (dev + prod + build) |

**Idempotency**: §3.7 checks SSM at `/duseum/{env}/stripe/platform_price_id` before calling Stripe — skips creation if the price ID already exists. All other sections use `--no-overwrite` or equivalent guard.

**Input file**: Copy `scripts/.secrets.env.example` → `scripts/.secrets.env` and fill in Stripe keys and webhook secrets. The example file documents exactly what bootstrap creates so you know what is and is not your responsibility to supply.

| Phase | What | Who | Time | External Wait |
|---|---|---|---|---|
| 0 | Accounts, domain, external services | 👤 Manual | 2–3 hrs | ⚠️ 1–5 days (Stripe) |
| 0.5 | Run `bootstrap.sh` — provisions all external resources | 🤖 Script | 5–10 min | — |
| 1 | CDK bootstrap (OIDC stack) | 🤖 CDK bootstrap | 15 min | — |
| 2 | GitHub repo + secrets | 👤 Manual | 20 min | — |
| 3 | First CDK deploy (dev) — gated by `_pre-deploy-check.yml` | 🤖 CI/CD | 20 min | — |
| 4 | First app deploy (dev) — dep-check gates smoke tests | 🤖 CI/CD | 10 min | — |
| 5 | Production go-live checklist | 👤 + 🤖 | 1–2 hrs | — |

### 11.2 Phase 0 — Accounts, Domain & External Services

#### Domain

| Step | Action | Who | Time |
|---|---|---|---|
| D-01 | Domain `duseum.com` is already acquired — proceed to D-02 | — | — |
| D-02 | Create Route 53 hosted zone for domain | 👤 | 5 min |
| D-03 | Update nameservers at registrar to the 4 Route 53 NS records | 👤 | 10 min |
| D-04 | Verify propagation: `dig NS duseum.com +short` | 🤖 | Up to 48hr |

#### AWS Accounts

| Step | Action | Who | Time |
|---|---|---|---|
| A-01 | Create Management AWS account at aws.amazon.com | 👤 | 20 min |
| A-02 | Enable MFA on management root account | 👤 | 10 min |
| A-03 | Create AWS Organizations; create two sub-accounts: `duseum-dev`, `duseum-prod` | 👤 | 15 min |
| A-04 | Enable IAM Identity Center (SSO); create your user; assign AdministratorAccess to both accounts | 👤 | 20 min |
| A-05 | Configure AWS CLI SSO profiles: `duseum-dev`, `duseum-prod` | 🤖 | 10 min |
| A-06 | Enable billing alerts: $50 and $200 thresholds | 👤 | 10 min |

```bash
# After IAM Identity Center setup:
aws configure sso
# Follow prompts; create profiles named duseum-dev and duseum-prod

aws sso login --profile duseum-dev
aws sts get-caller-identity --profile duseum-dev   # verify
```

#### Stripe

| Step | Action | Who | Time |
|---|---|---|---|
| S-01 | Create Stripe account at stripe.com | 👤 | 15 min |
| S-02 | Complete business verification ⚠️ (1–5 days) | 👤 | 20 min |
| S-03 | Enable Stripe Connect (Express accounts) | 👤 | 5 min |
| S-04 | Create webhook endpoint in test mode: events `customer.subscription.*`, `invoice.payment_failed`, `payment_intent.succeeded`, `payment_intent.payment_failed` | 👤 | 5 min |
| S-05 | Note: `pk_test_*`, `sk_test_*`, webhook signing secret `whsec_*` | 👤 | 5 min |

#### Email (SES)

| Step | Action | Who | Time |
|---|---|---|---|
| E-01 | Verify domain in SES (add TXT + DKIM records to Route 53) | 👤 | 15 min |
| E-02 | Request SES production access ⚠️ (24–48hr) | 👤 | 10 min |
| E-03 | Verify sender address `no-reply@duseum.com` in SES (individual email verification — click the link sent to that inbox) | 👤 | 5 min |

### 11.3 Phase 1 — CDK Bootstrap

Run CDK bootstrap once per account/region before any CDK deploy:

```bash
# Bootstrap dev account
aws sso login --profile duseum-dev
npx cdk bootstrap aws://$(aws sts get-caller-identity --profile duseum-dev --query Account --output text)/us-east-1 \
  --profile duseum-dev \
  --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess

# Bootstrap prod account
aws sso login --profile duseum-prod
npx cdk bootstrap aws://$(aws sts get-caller-identity --profile duseum-prod --query Account --output text)/us-east-1 \
  --profile duseum-prod
```

Then set up GitHub Actions OIDC trust (CDK construct in `infrastructure/stacks/oidc-stack.ts`):

```bash
# This creates the IAM OIDC provider + roles for GitHub Actions (no static keys)
cd infrastructure
npx cdk deploy OidcStack --context env=dev --profile duseum-dev
npx cdk deploy OidcStack --context env=prod --profile duseum-prod

# Note the role ARNs output by the stack
```

### 11.4 Phase 2 — GitHub Repository Settings

```
GitHub → duseum repo → Settings:

1. Environments → Create: dev, prod
   prod: ✅ Required reviewers (your GitHub username)

2. Secrets and variables → Actions → New repository secret:
   AWS_ROLE_ARN_DEPLOY_DEV   (from Phase 1 OIDC stack output)
   AWS_ROLE_ARN_DEPLOY_PROD  (from Phase 1 OIDC stack output)
   AWS_ACCOUNT_ID_DEV
   AWS_ACCOUNT_ID_PROD

3. Environment secrets → dev:
   STRIPE_SECRET_KEY          = sk_test_{key}
   STRIPE_WEBHOOK_SECRET      = whsec_{secret}

4. Environment secrets → prod: (sk_live_ — add only at go-live)
```

### 11.5 Phase 0.5 — Run `bootstrap.sh` (Before First CDK Deploy)

`bootstrap.sh` provisions all external resources that CDK depends on. Run this **before** the first CDK deploy and **before** pushing to `develop` (the `_pre-deploy-check.yml` job will fail if these prerequisites are missing).

```bash
# 1. Fill in Stripe keys + webhook secrets
cp scripts/.secrets.env.example scripts/.secrets.env
# Edit scripts/.secrets.env — add real Stripe keys for dev and prod

# 2. Log into AWS SSO
aws sso login --profile rmw-llc

# 3. Run bootstrap — provisions everything for both dev and prod
bash scripts/bootstrap.sh
```

Bootstrap provisions (idempotent — safe to re-run):
- Stripe secret/webhook keys → Secrets Manager (`duseum/{env}/stripe/*`)
- Stripe publishable key → SSM (`/duseum/{env}/stripe/publishable_key`)
- CI/CD artifact S3 bucket (`duseum-cicd-artifacts`)
- DynamoDB config table static rows (`PLATFORM_CUT_PERCENT`, limits, slots)
- Stripe platform subscription product + price → `PLATFORM_SUB_PRICE_ID` config row
- CloudFront RSA key pairs + key groups
- GitHub Actions OIDC provider
- GitHub Actions IAM deploy roles

Verify prerequisites after bootstrap:
```bash
# Confirm pre-deploy-check would pass
bash scripts/pre-deploy-check.sh dev

# Verify SSM stack outputs (written by CDK, not bootstrap)
aws ssm get-parameters-by-path --path /duseum/dev/stacks/ \
  --query 'Parameters[*].Name' --profile rmw-llc

# Deploy all stacks to dev
cd infrastructure
npx cdk deploy --all --context env=dev --profile rmw-llc
```

### 11.6 Phase 4 — First Application Deploy

Push a commit to `develop`. The `deploy-dev.yml` workflow triggers automatically:

1. CI checks pass
2. Bootstrap Check (`_pre-deploy-check.yml`) runs **in parallel with Build** — verifies all bootstrap.sh outputs exist; fails fast with "run bootstrap.sh" message if anything is missing
3. Lambda ZIPs built and uploaded to S3 artifacts bucket
4. CDK deploys all stacks (Lambda ZIPs referenced from S3)
5. Frontend deployed to S3 + CloudFront
6. Dep Check (`_dep-check.yml`) runs — verifies config table seeded, secrets present, Stripe price active; distinguishes "table missing (CDK failed)" from "key missing (bootstrap gap)"
7. Smoke tests run only if dep-check passes

If dep-check fails, consult the job output:
- "Config table not found" → CDK deploy may have failed; re-run CDK deploy
- "Key missing: PLATFORM_SUB_PRICE_ID" → run `bash scripts/bootstrap.sh` (§3.7)
- "Key is placeholder" → bootstrap §3.7 did not complete; re-run bootstrap

Verify locally:
```bash
bash scripts/pre-deploy-check.sh dev   # bootstrap prerequisites
bash scripts/dep-check.sh dev          # runtime data (requires deployed CDK)
bash scripts/smoke-test.sh dev $SHA   # end-to-end
```

### 11.7 Phase 5 — Production Go-Live Checklist

```
□ SES production access approved (Phase 0 E-02)
□ Stripe live mode verified; sk_live_ key stored in prod Secrets Manager
□ Stripe live webhook endpoint configured pointing to prod API Gateway URL
□ ACM certificate status = ISSUED in prod account
□ All SSM parameters present for prod: aws ssm get-parameters-by-path ...
□ CDK deploy to prod completed (via deploy-prod.yml workflow_dispatch)
□ Smoke tests passing: bash scripts/smoke-test.sh prod $SHA
□ CloudFront signed URL generation tested end-to-end (private art piece)
□ Stripe webhook test event processed successfully (use stripe trigger command)
```

Tag and release:
```bash
git tag v1.0.0 && git push origin v1.0.0
# deploy-prod.yml triggers automatically
# Pauses at "prod" environment gate for manual approval
# After approval: CDK deploy to prod → smoke tests
```

### 11.8 Local Development Tools

| Tool | Version | Install | Purpose |
|---|---|---|---|
| Node.js | 20 LTS | `brew install node@20` | All TypeScript / Lambda dev |
| npm | 10+ | Bundled with Node | Package management |
| AWS CLI | v2 | `brew install awscli` | AWS management |
| AWS CDK CLI | 2.x | `npm install -g aws-cdk` | Infrastructure deploy |
| Docker Desktop | Latest | `brew install --cask docker` | MiniStack + docker-compose |
| Stripe CLI | Latest | `brew install stripe/stripe-cli/stripe` | Local webhook testing |
| MiniStack | Latest | `docker pull nahuelnucera/ministack` (via docker-compose) | Local AWS services |

---

## 12. Implementation Plan

### 12.1 Stage Classification

| Symbol | Who | Description |
|---|---|---|
| 👤 | Human | Account creation, API key setup, browser UI |
| 🤖 | Automated | Scripted or CI/CD action |
| 🤝 | AI-assisted | Claude Code / AI IDE implements; developer reviews and approves |

### 12.2 Stage 1 — Foundation (Week 1–2)

Goal: running CDK deploy, local development environment, Cognito working end-to-end.

| Task | Who | Notes |
|---|---|---|
| Phase 0–4 of bootstrap (Section 11) | 👤 | External waits: start Stripe immediately |
| Scaffold monorepo structure (all directories, root package.json, turbo.json) | 🤝 | Follow Section 6.1 exactly |
| Implement `packages/shared`: DynamoDB client, error classes, Middy middleware stubs | 🤝 | Foundation for all Lambdas |
| Implement all CDK stacks: Storage, Auth, Messaging (SQS only), CDK synth validates | 🤝 | No ApiStack yet |
| Implement `auth-triggers-lambda` (Cognito Post-Confirmation → create Viewer profile) | 🤝 | First Lambda |
| Connect Cognito Hosted UI to local test; verify Viewer profile created post-confirmation | 👤 | Manual smoke test |
| Set up MiniStack via docker-compose + ministack-init seed container | 🤝 | See Section 16 |

### 12.3 Stage 2 — Core Art Piece Flow (Week 3–4)

Goal: Authors can upload and publish art pieces; Viewers can browse and view.

| Task | Who | Notes |
|---|---|---|
| Implement `media-lambda` (upload intent presigned URL) | 🤝 | |
| Implement `artworks-lambda`: create, list (public), get (with access tier logic) | 🤝 | Use `checkArtPieceAccess` from shared |
| Implement `users-lambda`: GET /users/me, POST /users/me/author (Author onboarding) | 🤝 | |
| Implement `ApiStack` CDK: API GW HTTP API, Cognito authorizer, all Lambda integrations | 🤝 | |
| Implement `CdnStack` CDK: CloudFront for SPA and media, ACM cert | 🤝 | |
| Implement CloudFront signed URL generation (private pieces) | 🤝 | Uses Secrets Manager key |
| Build React frontend: homepage, browse page, art piece detail page, auth flow (Cognito) | 🤝 | |
| Integrate S3 direct upload from frontend (presigned URL flow) | 🤝 | |
| Deploy to dev; manual end-to-end test: signup → create Author → upload piece → view | 👤 | |

### 12.4 Stage 3 — Subscriptions & Monetization (Week 5–6)

Goal: Platform and Author subscriptions work end-to-end with Stripe.

| Task | Who | Notes |
|---|---|---|
| Implement `subscriptions-lambda`: Checkout session creation (platform + author), portal | 🤝 | |
| Implement `subscriptions-webhook-lambda`: all Stripe subscription events + `payment_intent.succeeded` / `payment_intent.payment_failed` for weekly feature bookings; idempotency table for all | 🤝 | Most critical correctness requirement |
| Stripe Connect onboarding flow for Authors (connect account, verify) | 🤝 | |
| Wire free-tier limit enforcement in `artworks-lambda` using config table | 🤝 | |
| Wire platform subscriber check in `artworks-lambda` | 🤝 | |
| Wire Author subscriber check + CloudFront signed URL for PRIVATE pieces | 🤝 | |
| Build frontend: subscription CTA, checkout redirect, subscription management page | 🤝 | |
| Test Stripe webhooks end-to-end locally with Stripe CLI | 👤 | `stripe listen --forward-to localhost:3001/webhooks/stripe` |

### 12.5 Stage 4 — Social Features & Notifications (Week 7–8)

Goal: Comments, reactions, follows, and new-piece email notifications working end-to-end.

| Task | Who | Notes |
|---|---|---|
| Implement `social-lambda`: comments CRUD, reaction upsert/delete | 🤝 | |
| Implement `users-lambda`: follow/unfollow (with `NotificationPreference` record creation/deletion), `GET/PUT /users/me/notification-preferences` | 🤝 | Follow creates default preference record; unfollow deletes it |
| Build frontend: comment thread on piece detail, reaction buttons, follow button with notification pref UI | 🤝 | Follow button should expose "Notify me" toggle defaulting to ALL_NEW_PIECES |
| Implement collections CRUD in `artworks-lambda` | 🤝 | |
| Add notification SQS queue + DLQ to `MessagingStack` CDK | 🤝 | Reference Section 5.2 + SSM outputs in Section 5.4 |
| Wire `artworks-lambda`: on piece publish (visibility PUBLIC or PRIVATE), enqueue `NEW_PIECE_PUBLISHED` message to notification queue | 🤝 | Must NOT block the `POST /artworks` response — fire-and-forget SQS SendMessage |
| Implement `notifications-lambda`: SQS trigger → load followers (or Author Subscribers for PRIVATE) → apply preference filters → SES SendBulkEmail → update `notifiedCount` on ArtPiece | 🤝 | Reference Section 4.6 request flow for full fan-out logic |
| Implement `GET /notifications/unsubscribe` (public, no JWT) in `users-lambda`: validate signed token → set per-Author pref to NONE | 🤝 | Token signing/verification lives in `packages/shared/src/auth/` |
| Add SES email template for new-piece notification (HTML + plain text; includes one-click unsubscribe link) | 🤝 | Template rendered in `notifications-lambda`; thumbnail omitted for PRIVATE pieces |
| Test notification flow end-to-end locally: follow Author → publish piece → SQS message appears in MiniStack → `notifications-lambda` triggered → SES captured in MiniStack logs | 👤 | `docker-compose logs -f ministack` to inspect captured SES emails |
| Test unsubscribe flow: invoke `GET /notifications/unsubscribe?token=...` → preference updated → next publish does not notify that Viewer | 👤 | |

### 12.6 Stage 5 — Featured Authors (Week 9)

Goal: Daily Featured Author selection and Weekly Featured Author booking work end-to-end.

| Task | Who | Notes |
|---|---|---|
| Add `WeeklyFeatureBooking` + `DailyFeatureLog` DynamoDB entities + `GSI-WeeklyFeatureByStatus` to StorageStack CDK | 🤝 | Reference Section 4.7 table design |
| Add config table seeds to `ministack-init`: `DAILY_FEATURED_AUTHOR`, `WEEKLY_FEATURE_FEE_USD`, etc. | 🤝 | Reference Section 4.7 config table |
| Implement `features-lambda`: `GET /features/daily`, `GET /features/weekly`, `GET /features/weekly/availability`, `POST /features/weekly/book`, `GET /features/weekly/my-bookings` | 🤝 | Booking route: eligibility check (3-month window) + slot availability check + Stripe Payment Intent creation |
| Implement weekly feature Payment Intent handling in `subscriptions-webhook-lambda` (`payment_intent.succeeded` → confirm booking; `payment_intent.payment_failed` → release held slot) | 🤝 | Must use idempotency table; same pattern as subscription webhooks |
| Implement `maintenance-lambda` daily task: random Author selection (exclude last 7) → write `DAILY_FEATURED_AUTHOR` config; update `DAILY_FEATURED_EXCLUSIONS` | 🤝 | EventBridge rule: `cron(0 0 * * ? *)` |
| Implement `maintenance-lambda` weekly task: Monday rotation — (1) `CONFIRMED`→`ACTIVE` for current week; (2) `ACTIVE`→`ARCHIVED` for previous week; (3) safety-net: `CONFIRMED`→`ARCHIVED` for previous week (late payments) | 🤝 | EventBridge rule: `cron(0 0 ? * MON *)` |
| Add admin routes: `PUT /admin/features/daily/override`, `DELETE /admin/features/weekly/bookings/{bookingId}` (with Stripe refund), `GET /admin/features/weekly` | 🤝 | In `admin-lambda` |
| Build frontend: homepage Daily Featured Author spotlight + Weekly Featured Authors carousel; Author dashboard booking UI (availability calendar, book CTA, booking history); Admin panel feature management | 🤝 | |
| Test full booking flow locally: book week → Stripe CLI `stripe trigger payment_intent.succeeded` → booking confirmed → Monday rotation cron runs → `ACTIVE` | 👤 | |

### 12.7 Stage 6 — Admin & Polish (Week 10)

Goal: Admin panel, monitoring, production ready.

| Task | Who | Notes |
|---|---|---|
| Implement `admin-lambda`: user management, content moderation, config updates (including feature settings) | 🤝 | |
| Implement `MonitoringStack` CDK: dashboards, alarms, X-Ray | 🤝 | |
| Implement `maintenance-lambda`: expired upload intent cleanup, view count sync | 🤝 | Featured Author tasks already done in Stage 5 |
| Build frontend: admin panel, Author dashboard (analytics, subscriber count, MRR, feature history) | 🤝 | |
| Performance testing: Lambda cold start measurement, DynamoDB access pattern validation | 👤 | |
| Production go-live checklist (Section 11.7) | 👤 | |

---

## 13. Project Rules & AI-IDE Guidelines

> This section is reproduced in `.claude/CLAUDE.md` (or equivalent AI IDE config). Every AI-assisted development session must begin by reading this section.

### 13.1 Prime Directives

1. **This document is the source of truth.** Before writing any code, read the relevant section(s) of PROJECT.md. Do not infer architecture from existing code.

2. **Spec before code.** For any non-trivial task (new Lambda route, new DynamoDB access pattern, new CDK resource), produce a concise spec before writing implementation code. The spec must reference the relevant section(s) of PROJECT.md. Do not write implementation code until the spec is explicitly approved.

3. **One Lambda per route group.** Never add new route domains to an existing Lambda. Adding a new functional domain means creating a new Lambda. Reference Section 4.2 for the complete Lambda inventory.

4. **No hardcoded AWS resource names, ARNs, or account IDs.** All resource references must be read from SSM Parameter Store at `/duseum/{env}/stacks/{stack}/{key}` or from environment variables injected by CDK. Reference Section 5.4.

5. **Access control is always server-side.** Art piece access tier checks happen in `artworks-lambda` using `checkArtPieceAccess()`. Never enforce access control only in the frontend. Reference Section 6.5.

6. **Stripe webhook processing must be idempotent.** Every Stripe event handler must: (1) check the idempotency table before processing, (2) write the eventId to the idempotency table after processing. Reference Section 4.5.

7. **Private art pieces are served via CloudFront signed URLs only.** Never return a direct S3 URL or unsigned CloudFront URL for `visibility = PRIVATE` pieces. Reference Section 4.4.

8. **Secrets are always read from Secrets Manager.** Never put secret values in environment variables, CDK code, or GitHub secrets for runtime use. GitHub secrets are only for CI/CD IAM roles. Reference Section 10.3.

9. **DynamoDB access patterns are pre-defined.** Do not add new DynamoDB queries that require a full table scan or new GSI without updating Section 4.7 first and getting approval. All access patterns must be documented in the table design.

10. **Two environments only: dev and prod.** Do not create a staging or QA environment. Local development uses MiniStack. Reference Section 9.1.

11. **Feature booking logic lives exclusively in `features-lambda` and `subscriptions-webhook-lambda`.** The `admin-lambda` calls the same DynamoDB repositories but never reimplements booking eligibility or slot counting logic — those live in `packages/shared/src/features/`. The `maintenance-lambda` owns the daily selection and weekly rotation jobs — do not duplicate scheduling logic elsewhere. Reference Section 4.2.

12. **New-piece notification fan-out must never block the `POST /artworks` HTTP response.** The `artworks-lambda` enqueues a single SQS message on publish and returns immediately to the Author. All follower iteration, preference filtering, and SES calls happen exclusively in `notifications-lambda`. Do not call SES, query Follow records, or loop over followers anywhere in `artworks-lambda`. Reference Section 4.6, FR-NOTIF-02, and FR-NOTIF-09.

### 13.2 Lambda Coding Conventions

**Handler file structure:**
```
lambdas/{name}/
├── src/
│   ├── handler.ts       # Middy entry point + middleware stack only
│   ├── router.ts        # Route dispatch (method + path → handler function)
│   └── routes/
│       ├── {verb}-{resource}.ts   # One file per route (e.g., get-artwork.ts)
│       └── ...
├── package.json
└── tsconfig.json
```

**Naming:**
- Lambda handler functions: `get{Entity}`, `list{Entities}`, `create{Entity}`, `update{Entity}`, `delete{Entity}`
- Repository functions: `get{Entity}`, `list{Entities}By{Key}`, `put{Entity}`, `delete{Entity}` — in `packages/shared/src/db/{entity}.repository.ts`
- Types: `{Entity}` (no DTO suffix) — in `packages/shared/src/types/{entity}.ts`

**Error handling:**
- Throw `AppError` subclasses from business logic; never throw raw `Error`
- `errorHandlerMiddleware` in Middy stack catches all errors and formats the response
- Never return a raw `catch (e) { return { statusCode: 500, body: e.message } }` — always use the middleware

**Logging:**
- Use structured JSON logging (e.g., `aws-lambda-powertools-typescript` Logger)
- Log at INFO for business events, ERROR for unexpected failures
- Never log PII (email, name, payment details)
- Always include `requestId` and `userId` (if available) in every log line

**Response format (all successful responses):**
```typescript
// 200/201:
return {
  statusCode: 200,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
}
// List responses always include pagination:
{ items: [...], nextCursor: "..." | null }
```

### 13.3 Frontend Conventions

> **The complete visual specification lives in Section 6.8 (Frontend Design System).** Read Section 6.8 in full before building any component, page, or style. All tokens, component patterns, typography rules, layout rhythms, and animation specs are defined there and derived from the Duseum landing page (`index.html`). Do not introduce colors, fonts, spacing values, or component patterns that are not listed in Section 6.8 without updating that section first.

**Framework & tooling:**
- React 18 with TypeScript; Vite build
- Tailwind CSS — all styling through utility classes; no CSS modules, no styled-components, no inline `style` props (except for dynamic gradient/mask values that cannot be expressed as static Tailwind utilities)
- Zustand for global state (auth, UI); React Query for server state (API calls, caching)
- AWS Amplify SDK for Cognito auth (token management, refresh, OAuth)
- `clsx` + `tailwind-merge` exposed as `cn()` from `frontend/src/lib/utils.ts`

**File & naming conventions:**
- `kebab-case` for all filenames (`art-piece-card.tsx`, `use-artworks.ts`)
- PascalCase for component exports (`ArtPieceCard`, `EyebrowLabel`)
- camelCase for hooks (`useArtworks`, `useReveal`)
- One component per file; co-locate test files as `{component}.test.tsx`

**Design token usage:**
- All colors via Tailwind classes that map to tokens in `tailwind.config.ts` (Section 6.8.3) — e.g. `bg-ink`, `text-gold`, `border-gold/10`
- No hex values in component code — always use token classes
- Typography via `font-display` / `font-body` / `font-mono` Tailwind classes (Section 6.8.4)

**Section layout rhythm** (every page, alternating):
```
bg-ink → bg-ink-soft → bg-ink → bg-ink-soft
border-t border-gold/10 separating each section
max-w-[1100px] mx-auto container on all content
py-28 px-8 standard section padding (py-20 px-5 on mobile)
```

**Scroll reveal:** Use the `useReveal` hook (Section 6.8.6) on every below-the-fold section and its children. Stagger children with `reveal-delay-{1-4}` classes.

**Routing:** React Router v6; lazy-loaded pages via `React.lazy` + `Suspense`. All route paths mirror the API URL structure where applicable (e.g. `/artworks/:id`, `/authors/:authorId`).

### 13.4 CDK Conventions

- **One construct class per logical resource group** in `infrastructure/constructs/`
- **No hardcoded strings**: all names use the naming convention from Section 5.5, generated from `env` context variable
- **Every stack writes its outputs to SSM** after deployment (using CDK `CfnOutput` + SSM `StringParameter`)
- **Lambda construct defaults** (in `constructs/lambda-function.ts`): runtime Node.js 20, architecture ARM64, tracing X-Ray active, log retention 14 days dev / 90 days prod, reserved concurrency configurable

### 13.5 Infrastructure Conventions

- **CDK synth must pass with zero warnings** before any PR is merged (`cdk synth --strict`)
- **Never add a resource to a stack that doesn't own it** (reference Section 5.2 for stack ownership)
- **Cross-stack references via SSM only** — no CDK `Fn.importValue()` / `CfnOutput` cross-stack references
- **Tag all resources** with: `Project=duseum`, `Environment={env}`, `Stack={stackName}`

### 13.6 Settled Decisions — Do Not Re-Litigate

These decisions are final. Do not propose alternatives without updating PROJECT.md first:

- Modular Lambdas (not Lambdalith, not Hono, not NestJS) — Section 4.2
- Plain TypeScript router pattern (no routing framework) — Section 6.3
- DynamoDB single-table design (not RDS, not Aurora Serverless) — Section 4.7
- Middy for Lambda middleware (not custom middleware chains) — Section 6.2
- AWS CDK TypeScript for infrastructure (not Terraform, not SAM) — Section 5
- Cognito for auth (not Auth0, not Clerk) — Section 7.1
- CloudFront signed URLs for private content (not Lambda@Edge, not API Gateway streaming) — Section 4.4
- Stripe SQS queue pattern for webhooks (API GW → SQS → Lambda, not API GW → Lambda directly) — Section 4.5
- New-piece notifications via SES (not SNS push, not in-app websocket-only, not third-party email service) — Section 2.12
- Notification fan-out is async via SQS → `notifications-lambda` (not inline in `artworks-lambda`, not EventBridge) — Section 4.6
- Frontend design system: dark editorial/gallery theme, Playfair Display + DM Sans + DM Mono, amber-gold accent (`#c8973a`), ink backgrounds (`#0e0d0b` / `#1c1a16`) — Section 6.8. Do not change the color palette, font stack, or aesthetic direction without updating Section 6.8 first
- Two environments: dev and prod (not dev/staging/prod) — Section 9.1
- MiniStack (nahuelnucera/ministack) for local AWS emulation (not LocalStack) — Section 16
- No hardcoded ARNs or resource names anywhere in code or workflows — Section 5.4

### 13.7 Spec Format (Required Before Implementation)

Before implementing any non-trivial task, produce a spec in this format:

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

### 13.8 CLAUDE.md Quick Reference

```markdown
# Duseum — CLAUDE.md
"Read this CLAUDE.md and acknowledge the project rules.
Then read PROJECT.md sections [relevant sections].
Before writing code, produce a spec using the Section 13.7 format."

Do not write implementation code until I reply: "Approved — proceed."

## Stack (non-negotiable)
- Runtime: Node.js 20, TypeScript 5
- Lambda middleware: Middy (no Express/Hono/NestJS)
- Database: DynamoDB single-table (no SQL, no Aurora)
- Auth: Amazon Cognito (no Auth0/Clerk)
- IaC: AWS CDK TypeScript (no Terraform/SAM)
- Local AWS: MiniStack (`nahuelnucera/ministack`) at `localhost:4566` — not LocalStack
- Frontend: React 18 + Vite + Tailwind + Zustand + React Query

## Critical rules
1. No hardcoded ARNs, resource names, or account IDs
2. Access control is always server-side (Lambda), never frontend-only
3. Stripe webhook handler must check idempotency table first — this applies to both subscription events AND weekly feature Payment Intent events
4. Private pieces require CloudFront signed URLs — never direct S3/unsigned CDN URLs
5. Secrets from Secrets Manager only — never env vars for secret values
6. Spec required before implementation (Section 13.7 format)
7. Weekly feature booking eligibility and slot-count logic live in `packages/shared/src/features/` — never reimplemented inline in a Lambda route handler
8. Notification fan-out NEVER blocks `POST /artworks` — `artworks-lambda` publishes one SQS message and returns; all fan-out logic lives in `notifications-lambda`
9. PRIVATE piece notifications go to Author Subscribers only — never to mere followers. PUBLIC piece notifications go to all followers. This logic lives in `notifications-lambda`; never enforced in `artworks-lambda`
8. **Notification fan-out never blocks the publish response.** `artworks-lambda` sends ONE SQS message and returns. All fan-out logic (follower queries, preference checks, SES calls) lives in `notifications-lambda` only

## Common mistakes — never do these
- Don't add routes to the wrong Lambda (check Section 4.2 — features routes belong in `features-lambda`, not `admin-lambda` or `subscriptions-lambda`)
- Don't call SES, query Follow records, or loop over followers inside `artworks-lambda` — enqueue SQS and return
- Don't send notification emails for DRAFT pieces or for visibility changes after initial publish (see FR-NOTIF-11)
- Don't send PRIVATE piece notifications to plain followers — only to Author Subscribers (see Section 4.6 fan-out flow step 4b)
- Don't implement booking eligibility (3-month window) or slot counting inline in a route handler — use `packages/shared/src/features/`
- Don't put the daily selection or weekly rotation logic in `features-lambda` — those are `maintenance-lambda` scheduled jobs
- Don't process `payment_intent.*` events for weekly feature bookings in a new Lambda — `subscriptions-webhook-lambda` handles all Stripe webhook events
- Don't use hex color values in component code — use Tailwind token classes (`bg-ink`, `text-gold`, `border-gold/10`) defined in Section 6.8.3
- Don't use Inter, Roboto, system-ui, or any font not in the Duseum font stack (Playfair Display / DM Sans / DM Mono) — Section 6.8.4
- Don't use inline `style` props for static values — only for dynamic gradient/mask values that cannot be expressed as Tailwind utilities
- Don't use CSS modules or styled-components — Tailwind utility classes only
- Don't use purple gradients, blue CTAs, or any color outside the token palette (Section 6.8.2) — they break the museum aesthetic
- Don't call SES or query Follow records inside `artworks-lambda` — that is `notifications-lambda`'s job, triggered asynchronously via SQS
- Don't send notification emails for PRIVATE pieces to followers who are not Author Subscribers — check subscription status in `notifications-lambda` before sending
- Don't skip the preference check — always query `NOTIF_PREF#AUTHOR#{authorId}` and the global opt-out flag before sending; a missing record means `ALL_NEW_PIECES` (the default), not NONE
- Don't do DynamoDB full table scans (check Section 4.7 access patterns)
- Don't create new GSIs without updating PROJECT.md Section 4.7 first
- Don't return raw Error messages to API clients — use AppError subclasses
- Don't log PII (email, names, payment info)
- Don't use `Fn.importValue()` in CDK — use SSM for cross-stack wiring
- Don't use `awslocal` CLI wrapper — use standard `aws` CLI with `AWS_ENDPOINT_URL=http://localhost:4566` (MiniStack requires no special wrapper)
- Don't tag `v*.*.*` without completing the production go-live checklist (Section 11.7)
```

---

## 14. Infrastructure Cost Estimates

All estimates are for `us-east-1`. Dev costs assume light development traffic (~1K API requests/day). Prod costs assume 500 monthly active users with 10K API requests/day and 50GB of media storage.

### 14.1 Dev Environment

| Service | Usage | Est. Monthly Cost |
|---|---|---|
| Lambda | 30K invocations/month, 256MB, avg 200ms | ~$0.10 |
| API Gateway HTTP API | 30K requests/month | ~$0.03 |
| DynamoDB on-demand | 100K reads, 20K writes | ~$0.15 |
| S3 (media) | 5GB storage, 10K GETs | ~$0.20 |
| CloudFront | 10GB transfer, 100K requests | ~$1.00 |
| Cognito | < 50K MAU (free tier) | $0.00 |
| SQS | < 1M requests (free tier) | $0.00 |
| SES | < 1K emails/month (free tier) | $0.00 |
| Secrets Manager | 6 secrets | ~$2.40 |
| CloudWatch | Basic logs + dashboards | ~$1.00 |
| **Total Dev** | | **~$5–7/month** |

### 14.2 Prod Environment (500 MAU)

| Service | Usage | Est. Monthly Cost |
|---|---|---|
| Lambda | 300K invocations/month, 256–512MB, avg 200ms | ~$2.00 |
| API Gateway HTTP API | 300K requests/month | ~$0.30 |
| DynamoDB on-demand | 1M reads, 200K writes | ~$1.50 |
| S3 (media) | 50GB storage, 500K GETs | ~$3.00 |
| CloudFront | 200GB transfer, 2M requests | ~$20.00 |
| Cognito | 500 MAU (free tier ≤ 50K) | $0.00 |
| SQS | 1M requests | $0.00 (free tier) |
| SES | ~50K emails/month (500 MAU × ~100 notifications) | ~$5.00 |
| Secrets Manager | 6 secrets | ~$2.40 |
| WAF (CloudFront only) | 10M requests | ~$6.00 |
| CloudWatch | Logs + dashboards + alarms | ~$5.00 |
| Route 53 | 1 hosted zone + queries | ~$1.00 |
| ACM | Free with CloudFront | $0.00 |
| **Total Prod** | | **~$45–55/month** |

> **Key advantage of serverless**: dev environment costs < $6/month. At zero traffic, Lambda, DynamoDB, SQS, and API Gateway cost essentially nothing. Costs scale linearly with usage — no idle ECS/EC2 charges.

> **Weekly Feature revenue note**: Each weekly feature booking is a Stripe one-time Payment Intent (not a subscription). Stripe charges 2.9% + $0.30 per transaction. At the default $25/week fee with 10 slots, gross revenue is $250/week; net after Stripe fees is ~$242/week (~$1,046/month). This is a meaningful revenue stream that scales with platform growth and does not affect the AWS infrastructure cost model.

---

## 15. Testing Plan

### 15.1 Testing Strategy

| Layer | Framework | Gate |
|---|---|---|
| Unit | Vitest | 80% coverage on `packages/shared` |
| Lambda integration | Vitest + MiniStack | All happy + error paths |
| Frontend unit | Vitest + Testing Library | 70% coverage |
| E2E | Playwright | Critical user flows only |
| Post-deploy smoke | pytest + boto3 + requests | Run after every deploy (dev + prod) |

**Smoke test details** (`scripts/smoke_tests/`):
- Framework: **pytest** with `pytest-json-report` for structured JSON output
- Test classes: `TestApiEndpoints` (5), `TestDynamoDB` (3 parametrized), `TestCloudFront` (2), `TestSPADomain` (2) — 12 tests total
- Results uploaded to: `s3://duseum-cicd-artifacts/{env}/smoke-tests/{sha}.results.json`
- Script: `scripts/smoke-test.sh {env} [{sha}]` — does NOT use `set -e`; collects all results before exiting with pytest's exit code
- `SMOKE_ENV` env var controls which environment's endpoints and resource names are tested

### 15.2 Unit Tests — `packages/shared`

**Scope**: Pure business logic with no AWS dependencies mocked.

**Key test files**:
```
packages/shared/src/
├── auth/
│   ├── access-control.test.ts    # checkArtPieceAccess — all 6 decision branches
│   └── jwt.test.ts               # Token validation helpers
├── db/
│   └── *.repository.test.ts      # DynamoDB expression builders (no real DB)
├── notifications/
│   ├── preference.test.ts        # resolveNotificationPref() — per-author override + global opt-out logic
│   └── unsubscribe-token.test.ts # generateUnsubscribeToken() + verifyUnsubscribeToken() — valid/expired/tampered
└── errors/
    └── index.test.ts             # AppError subclass hierarchy
```

**`access-control.test.ts` — critical test cases:**
```typescript
describe('checkArtPieceAccess', () => {
  it('Author always sees their own piece regardless of visibility')
  it('FREE viewer sees PUBLIC piece within free tier limit')
  it('FREE viewer is blocked on PUBLIC piece beyond free tier limit')
  it('Platform subscriber sees PUBLIC piece beyond free tier limit')
  it('Author subscriber sees PRIVATE piece (returns signUrl: true)')
  it('Non-subscriber is blocked on PRIVATE piece with REQUIRES_AUTHOR_SUB')
  it('DRAFT piece is accessible only to the Author')
  it('Non-author is blocked on DRAFT piece with FORBIDDEN')
})
```

### 15.3 Lambda Integration Tests

**Scope**: Full Lambda handler test using MiniStack (real DynamoDB, real S3 emulation). No mocks for AWS services. Mocks only for external services (Stripe).

**Framework**: Vitest + `@aws-sdk/client-dynamodb` against MiniStack endpoint (`http://localhost:4566`). Set `AWS_ENDPOINT_URL=http://localhost:4566` before running integration tests — no other code change needed.

**Test file pattern**: `lambdas/{name}/src/__tests__/{route}.integration.test.ts`

**Setup**:
```typescript
// lambdas/artworks/src/__tests__/setup.ts
import { DynamoDBClient, CreateTableCommand } from '@aws-sdk/client-dynamodb'

const client = new DynamoDBClient({
  endpoint: process.env.AWS_ENDPOINT_URL ?? 'http://localhost:4566',  // MiniStack
  region: 'us-east-1',
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' }
})

beforeAll(async () => {
  await client.send(new CreateTableCommand({
    TableName: 'duseum-test',
    // ... full table + GSI definition
  }))
})

afterEach(async () => {
  // Truncate table between tests
})
```

**Key integration tests:**

```
artworks-lambda/
├── get-artwork.integration.test.ts
│   - Public piece returned to unauthenticated user (within free tier)
│   - Public piece blocked beyond free tier (returns 402)
│   - Platform subscriber sees piece beyond free tier
│   - Private piece: Author subscriber gets signed URL
│   - Private piece: non-subscriber gets 402
│   - Draft piece: Author gets it; Viewer gets 403
│   - Non-existent piece returns 404

features-lambda/
├── book-weekly-feature.integration.test.ts
│   - Author with no prior bookings: eligible → Payment Intent created → slot count decremented
│   - Author with booking within 3-month window → 409 CONFLICT with eligibleAgainAfter date
│   - Week with 0 available slots → 409 CONFLICT
│   - Non-Author profile → 403 FORBIDDEN
│   - Booking a week beyond 8-week advance window → 400 VALIDATION_ERROR
├── weekly-availability.integration.test.ts
│   - Returns 8 weeks; correct slotsAvailable counts per week
│   - Week fully booked shows isAvailable: false
├── daily-feature.integration.test.ts
│   - Returns today's DAILY_FEATURED_AUTHOR from config table
│   - Returns 404 if config entry missing (maintenance-lambda hasn't run yet)

maintenance-lambda/
├── daily-selection.integration.test.ts
│   - Selects a random ACTIVE Author with PUBLIC pieces
│   - Never selects an Author in the last-7 exclusion list
│   - Writes DAILY_FEATURED_AUTHOR + updates DAILY_FEATURED_EXCLUSIONS in config table
│   - Updates exclusions list (max 7 entries, FIFO)
├── weekly-rotation.integration.test.ts
│   - CONFIRMED bookings for current week → promoted to ACTIVE
│   - Previous week ACTIVE bookings → archived to ARCHIVED
│   - CONFIRMED bookings for previous week → archived to ARCHIVED (safety-net for late payments)
│   - CANCELLED bookings are not promoted

subscriptions-webhook-lambda/
├── stripe-webhook.integration.test.ts
│   - customer.subscription.created → Subscription record created in DynamoDB
│   - customer.subscription.deleted → Subscription marked CANCELLED
│   - invoice.payment_failed → Subscription marked PAST_DUE
│   - payment_intent.succeeded (current week) → WeeklyFeatureBooking immediately ACTIVE + activatedAt set
│   - payment_intent.succeeded (future week) → WeeklyFeatureBooking status set to CONFIRMED (awaits Monday rotation)
│   - payment_intent.payment_failed (weekly feature) → WeeklyFeatureBooking status set to CANCELLED
│   - Replay of same eventId → idempotent (no duplicate processing)
│   - Invalid Stripe signature → 400 logged, event dropped

media-lambda/
├── upload-intent.integration.test.ts
│   - Non-Author profile → 403
│   - Valid Author → returns presigned URL + intentId + s3Key
│   - Invalid mimeType → 400
│   - File too large → 400

artworks-lambda/
├── publish-piece.integration.test.ts
│   - POST /artworks with visibility PUBLIC → ArtPiece created + SQS message enqueued to notification queue
│   - POST /artworks with visibility PRIVATE → ArtPiece created + SQS message enqueued
│   - POST /artworks with visibility DRAFT → ArtPiece created + NO SQS message enqueued
│   - SQS message payload contains correct artworkId, authorId, visibility, title, thumbnailS3Key
│   - Confirm HTTP response returns before SQS message is processed (fire-and-forget)

notifications-lambda/
├── fan-out-public.integration.test.ts
│   - PUBLIC piece: all followers notified regardless of Author subscription status
│   - Viewer with pref ALL_NEW_PIECES → receives email
│   - Viewer with pref PUBLIC_ONLY → receives email (PUBLIC piece)
│   - Viewer with pref NONE → skipped; no SES call for that recipient
│   - Viewer with global opt-out flag → skipped even if per-author pref is ALL_NEW_PIECES
│   - notifiedCount on ArtPiece incremented by count of successful sends
├── fan-out-private.integration.test.ts
│   - PRIVATE piece: only Author Subscribers notified (not mere followers)
│   - Author Subscriber with pref ALL_NEW_PIECES → receives email
│   - Author Subscriber with pref PUBLIC_ONLY → skipped (PRIVATE piece)
│   - Author Subscriber with pref NONE → skipped
│   - Follower who is NOT a subscriber → skipped even if pref is ALL_NEW_PIECES
├── fan-out-guard-rails.integration.test.ts
│   - Author with SUSPENDED profile → no notifications dispatched (guard at start of handler)
│   - ArtPiece no longer PUBLISHED by the time lambda runs → no notifications dispatched
│   - SQS message with unknown artworkId → logged + message deleted (no retry)
├── unsubscribe-token.unit.test.ts   # unit test in packages/shared
│   - Valid signed token → preference set to NONE
│   - Expired token (>30 days) → 400 VALIDATION_ERROR
│   - Tampered token (bad HMAC) → 400 VALIDATION_ERROR
```

### 15.4 Functional Testing Requirements (FR-TESTING)

These requirements are enforced by the spec gate in CLAUDE.md Section "Mandatory Process". A spec is not approved until every FR-TESTING requirement it touches is satisfied.

| Code | Requirement | Enforcement |
|---|---|---|
| FR-TESTING-01 | Every Lambda route must have ≥1 integration test asserting status code, response shape, and primary error case | Spec gate — no new route ships without it |
| FR-TESTING-02 | Routes with nested/wrapped response shapes must assert exact top-level key names (e.g. `{ profile, gallery }` unwrap) | Catches service mapping bugs before they reach prod |
| FR-TESTING-03 | Every frontend service function that maps an API response must have a unit test for every field mapping, including renamed fields and defaults | `vi.mock('../api')` pattern in `frontend/src/services/__tests__/` |
| FR-TESTING-04 | `checkArtPieceAccess()` must be unit-tested for all tier × visibility combinations (8 cases in Section 15.2) | Runs in `packages/shared` — no AWS dependencies |
| FR-TESTING-05 | Every significant UI component must have component tests (React Testing Library) covering: all conditional rendering branches (access tier, subscription state, auth state), mutation calls when the user interacts, route guard redirects, and error states | Added when the component is first implemented; covers props-driven branches, hook interactions, and service calls |
| FR-TESTING-06 | Every bug fix must be accompanied by a regression test that would have caught the bug before the fix | The test description must name the symptom (e.g. `followerCount.toLocaleString() crash`) |
| FR-TESTING-07 | Webhook processing (Stripe events) must be integration-tested for idempotency: replaying the same eventId must produce no duplicate state change | MiniStack DynamoDB idempotency table check |

**Test file locations** (authoritative):

```
packages/shared/src/__tests__/                          # FR-TESTING-04 + unit
lambdas/{name}/src/__tests__/*.integration.test.ts      # FR-TESTING-01/02/07
frontend/src/services/__tests__/*.service.test.ts       # FR-TESTING-03
frontend/src/components/__tests__/*.test.tsx            # FR-TESTING-05
```

**Coverage targets** (enforced in CI):

| Layer | Target | Tool |
|---|---|---|
| `packages/shared` | 80% line coverage | Vitest `--coverage` |
| Lambda routes | 100% of routes have ≥1 integration test | Manual audit via `specs/testing/test-coverage.md` |
| Frontend services | 100% of service files have a unit test | Manual audit via `specs/testing/test-coverage.md` |
| Frontend components (significant) | 100% rendering branches + mutation interactions | React Testing Library |

### 15.5 Frontend Tests

**Three sub-layers — all run via `npm test` in the `frontend/` workspace:**

| Sub-layer | Framework | Location | FR code |
|---|---|---|---|
| Service unit tests | Vitest + `vi.mock` | `src/services/__tests__/*.service.test.ts` | FR-TESTING-03 |
| Component tests | Vitest + React Testing Library | `src/components/__tests__/*.test.tsx` | FR-TESTING-05 |
| Hook tests | Vitest + MSW (future) | `src/hooks/*.test.ts` | FR-TESTING-03 |

**Shared test utilities** (`src/test/`):
- `setup.ts` — imports `@testing-library/jest-dom`; patches `window.location` to silence jsdom navigation warnings
- `test-utils.tsx` — exports a custom `render()` pre-wrapped in `QueryClientProvider` (retry disabled) + `MemoryRouter`

**Component test pattern**:
```tsx
// Wrap components that use React Query or React Router:
import { render } from '../../test/test-utils'
// Provide full route context (for components with Navigate redirects):
import { render as rtlRender } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
// Mock Zustand stores and service modules at module scope via vi.mock
```

**What component tests must cover** (per FR-TESTING-05):
1. All conditional rendering branches (access tier, subscription status, auth state, loading)
2. Mutation calls triggered by user interaction (click → service method called)
3. Unauthenticated redirect path (navigate to `/login`)
4. Error state rendering (error message shown after failed mutation)
5. Route guard redirects (ProtectedRoute, AdminRoute)

### 15.6 E2E Tests — Playwright

**Scope**: Critical user flows only. Full stack runs locally via MiniStack + local Lambda dev server (`npm run dev:lambdas`). Stripe test mode used with test card numbers.

**Test files**:
```
e2e/
├── auth/
│   └── signup.spec.ts          # Register → email verify → Viewer profile created
├── author/
│   └── upload-artwork.spec.ts  # Author onboarding → upload piece → view on profile
├── subscriptions/
│   └── platform-sub.spec.ts    # Free viewer hits limit → subscribe → unlimited access
│   └── author-sub.spec.ts      # Subscribe to Author → private section visible
├── features/
│   └── weekly-booking.spec.ts  # Author books week → Stripe payment → CONFIRMED → Monday rotation → ACTIVE on homepage
│   └── daily-feature.spec.ts   # Maintenance cron runs → homepage shows Daily Featured Author
├── notifications/
│   └── follow-notify.spec.ts   # Follow Author → Author publishes → SQS message present in MiniStack → notifications-lambda triggered → SES email captured in MiniStack logs
│   └── unsubscribe.spec.ts     # Follow Author → receive notification → click unsubscribe link → preference set to NONE → next publish does not notify
└── social/
    └── comments.spec.ts        # View piece → post comment → Author replies
```

**Critical E2E flow — follow and new-piece notification** (`follow-notify.spec.ts`):
```
1. Register Author → verify email → publish 1 PUBLIC piece
2. Register Viewer → verify email → follow Author
   (POST /follows/authors/{id} → NotificationPreference record created with ALL_NEW_PIECES)
3. Author publishes a second PUBLIC piece (POST /artworks, visibility: PUBLIC)
   → artworks-lambda returns 201 immediately
   → SQS message appears in duseum-local-notifications queue (verified via MiniStack SQS API)
4. Invoke notifications-lambda directly (or wait for SQS trigger in local dev)
   → notifications-lambda queries followers → finds Viewer → checks pref (ALL_NEW_PIECES) → calls SES
   → SES captured in MiniStack logs: "To: viewer@example.com, Subject: New piece by [Author]"
5. Viewer's notifiedCount on ArtPiece = 1 (DynamoDB GetItem)
6. Author publishes a PRIVATE piece
   → SQS message enqueued with visibility: PRIVATE
   → notifications-lambda: Viewer is a follower but NOT an Author Subscriber → skipped
   → notifiedCount on private ArtPiece = 0
```

**Critical E2E flow — weekly feature booking** (`weekly-booking.spec.ts`):
```
1. Register Author user → verify email → complete Author onboarding → publish 1 PUBLIC piece
2. Author navigates to "Feature my work" → views availability calendar
3. Author selects an available week → clicks "Book for $25"
4. Stripe Checkout with test card 4242... → payment succeeds
5. Stripe sends payment_intent.succeeded webhook → subscriptions-webhook-lambda processes
   → WeeklyFeatureBooking status = CONFIRMED in DynamoDB
6. Author views dashboard → booking shows as CONFIRMED for selected week
7. Simulate Monday rotation: invoke maintenance-lambda weekly task directly
   → booking promoted to ACTIVE
8. Homepage GET /features/weekly → Author appears in weekly featured section
9. Author attempts to book another week within 3-month window → 409 CONFLICT returned
   → frontend shows "Next eligible: {date}"
```

**Critical E2E flow — subscription access control** (`author-sub.spec.ts`):
```
1. Register Author user → verify email → complete Author onboarding
2. Upload 1 PRIVATE art piece (visibility: PRIVATE)
3. Register Viewer user → verify email
4. Viewer attempts GET /artworks/{id} → 402 REQUIRES_AUTHOR_SUB
5. Viewer clicks Subscribe → Stripe Checkout (test card 4242...)
6. Stripe sends webhook → subscriptions-webhook-lambda processes → Subscription created in DynamoDB
7. Viewer retries GET /artworks/{id} → 200 with CloudFront signed URL
8. Viewer loads signed URL → image renders
```

### 15.7 CI Test Execution Order

```
1. lint + typecheck (all workspaces, parallel)
2. unit tests — packages/shared (fast, no external deps)
3. unit tests — lambdas (fast, no external deps)
4. unit tests — frontend (fast)
5. integration tests — lambdas (requires MiniStack running — sequential, port conflicts)
6. CDK synth validate (both envs)
7. frontend build validate
8. E2E tests (Playwright — only on PR to develop or main; skipped on feature branches)
```

**Parallelism**: Steps 1–4 run in parallel. Steps 5–7 sequential. Step 8 only on PRs targeting `develop` or `main`.

### 15.8 Test Data Strategy

- **Unit tests**: inline test data (factory functions in `packages/shared/src/__tests__/factories.ts`)
- **Integration tests**: `beforeEach` seeds minimal DynamoDB records; `afterEach` truncates. Tests are independent — any order.
- **E2E tests**: Playwright fixtures in `e2e/fixtures/` seed test users + pieces before each suite
- **No shared mutable state between tests**

---

## 16. Local Development

### 16.1 MiniStack (AWS Emulation)

**MiniStack** is a free, MIT-licensed, open-source AWS emulator (`docker.io/nahuelnucera/ministack`). It is a drop-in replacement for LocalStack — same port (`4566`), same AWS SDK endpoint override, zero account or API key required. It supports 30+ AWS services, has a ~250MB image, and starts in ~2 seconds.

> Source: https://github.com/Nahuel990/ministack

MiniStack emulates DynamoDB, S3, SQS, SES, Secrets Manager, SSM, EventBridge, and CloudWatch locally. All Lambda functions run against MiniStack in local dev — no mocking of AWS services.

#### Step 1 — Clone and configure

```bash
git clone https://github.com/{org}/duseum.git
cd duseum
npm install
cp .env.example .env.local
# Edit .env.local: fill in your Stripe test keys (sk_test_*, whsec_*)
```

#### Step 2 — Start the full local stack

```bash
# Starts MiniStack + seeds all AWS resources + starts local Lambda server + frontend
docker-compose up -d

# Verify MiniStack is healthy
curl http://localhost:4566/_ministack/health

# Watch logs
docker-compose logs -f ministack
docker-compose logs -f ministack-init
```

> **First start**: The `ministack-init` container runs automatically after MiniStack is healthy. It pre-creates all required DynamoDB tables, S3 buckets, SQS queues, and Secrets Manager secrets using the AWS CLI pointed at `http://ministack:4566`. This takes ~5 seconds and exits cleanly.

#### Step 3 — Start the Lambda dev server

```bash
# In a separate terminal (outside Docker — hot-reload via tsx watch)
npm run dev:lambdas
# Starts local HTTP server at http://localhost:3001
# Routes requests to Lambda handlers based on path prefix
# MiniStack at http://localhost:4566 is used for all AWS SDK calls
```

#### Step 4 — Start the frontend

```bash
cd frontend
npm run dev
# Vite dev server at http://localhost:5173
# API calls proxied to http://localhost:3001 (local Lambda server)
```

#### Step 5 — Forward Stripe webhooks (for payment testing)

```bash
# In a separate terminal — keep running during payment development
stripe listen --forward-to http://localhost:3001/webhooks/stripe
# Copy the whsec_* secret → paste into .env.local as STRIPE_WEBHOOK_SECRET
```

#### Service & Port Reference

| Service | Container | Local Port | Notes |
|---|---|---|---|
| MiniStack (AWS emulation) | `duseum-ministack` | 4566 | DynamoDB, S3, SQS, SES, Secrets Manager, SSM |
| MiniStack init (one-shot) | `duseum-ministack-init` | — | Pre-creates all AWS resources; exits after completion |
| Lambda dev server | (host process) | 3001 | `npm run dev:lambdas`; hot-reload via `tsx watch` |
| Frontend (Vite) | (host process) | 5173 | `npm run dev` in `frontend/` |

**`docker-compose.yml`**:
```yaml
version: '3.9'

services:

  ministack:
    image: nahuelnucera/ministack:latest
    container_name: duseum-ministack
    ports:
      - "4566:4566"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ministack-data:/var/lib/ministack
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:4566/_ministack/health || exit 1"]
      interval: 5s
      timeout: 5s
      retries: 12

  ministack-init:
    image: amazon/aws-cli:latest
    container_name: duseum-ministack-init
    environment:
      AWS_ENDPOINT_URL: http://ministack:4566
      AWS_REGION: us-east-1
      AWS_ACCESS_KEY_ID: test
      AWS_SECRET_ACCESS_KEY: test
    depends_on:
      ministack:
        condition: service_healthy
    restart: on-failure
    command: >
      sh -c "
        echo '=== Creating DynamoDB tables ===' &&
        aws dynamodb create-table \
          --table-name duseum-local \
          --attribute-definitions \
            AttributeName=PK,AttributeType=S \
            AttributeName=SK,AttributeType=S \
            AttributeName=authorId,AttributeType=S \
            AttributeName=status,AttributeType=S \
            AttributeName=tag,AttributeType=S \
            AttributeName=featureStatus,AttributeType=S \
            AttributeName=isoWeek,AttributeType=S \
          --key-schema \
            AttributeName=PK,KeyType=HASH \
            AttributeName=SK,KeyType=RANGE \
          --billing-mode PAY_PER_REQUEST \
          --global-secondary-indexes \
            '[
              {\"IndexName\":\"GSI-AuthorPublic\",\"Keys\":[{\"AttributeName\":\"authorId\",\"KeyType\":\"HASH\"},{\"AttributeName\":\"SK\",\"KeyType\":\"RANGE\"}],\"Projection\":{\"ProjectionType\":\"ALL\"}},
              {\"IndexName\":\"GSI-AllPublicPieces\",\"Keys\":[{\"AttributeName\":\"status\",\"KeyType\":\"HASH\"},{\"AttributeName\":\"SK\",\"KeyType\":\"RANGE\"}],\"Projection\":{\"ProjectionType\":\"ALL\"}},
              {\"IndexName\":\"GSI-TagIndex\",\"Keys\":[{\"AttributeName\":\"tag\",\"KeyType\":\"HASH\"},{\"AttributeName\":\"SK\",\"KeyType\":\"RANGE\"}],\"Projection\":{\"ProjectionType\":\"ALL\"}},
              {\"IndexName\":\"GSI-WeeklyFeatureByStatus\",\"Keys\":[{\"AttributeName\":\"featureStatus\",\"KeyType\":\"HASH\"},{\"AttributeName\":\"isoWeek\",\"KeyType\":\"RANGE\"}],\"Projection\":{\"ProjectionType\":\"ALL\"}}
            ]' &&
        aws dynamodb create-table \
          --table-name duseum-local-idempotency \
          --attribute-definitions AttributeName=PK,AttributeType=S \
          --key-schema AttributeName=PK,KeyType=HASH \
          --billing-mode PAY_PER_REQUEST &&
        aws dynamodb create-table \
          --table-name duseum-local-config \
          --attribute-definitions AttributeName=PK,AttributeType=S \
          --key-schema AttributeName=PK,KeyType=HASH \
          --billing-mode PAY_PER_REQUEST &&

        echo '=== Seeding config table ===' &&
        aws dynamodb put-item --table-name duseum-local-config \
          --item '{\"PK\":{\"S\":\"FREE_TIER_LIMIT\"},\"value\":{\"N\":\"10\"}}' &&
        aws dynamodb put-item --table-name duseum-local-config \
          --item '{\"PK\":{\"S\":\"PLATFORM_CUT_PERCENT\"},\"value\":{\"N\":\"20\"}}' &&
        aws dynamodb put-item --table-name duseum-local-config \
          --item '{\"PK\":{\"S\":\"PLATFORM_SUB_PRICE_ID\"},\"value\":{\"S\":\"price_test_local\"}}' &&
        aws dynamodb put-item --table-name duseum-local-config \
          --item '{\"PK\":{\"S\":\"FEATURED_AUTHORS\"},\"authorIds\":{\"L\":[]}}' &&
        aws dynamodb put-item --table-name duseum-local-config \
          --item '{\"PK\":{\"S\":\"WEEKLY_FEATURE_FEE_USD\"},\"value\":{\"N\":\"25\"}}' &&
        aws dynamodb put-item --table-name duseum-local-config \
          --item '{\"PK\":{\"S\":\"WEEKLY_FEATURE_SLOT_COUNT\"},\"value\":{\"N\":\"3\"}}' &&
        aws dynamodb put-item --table-name duseum-local-config \
          --item '{\"PK\":{\"S\":\"WEEKLY_FEATURE_ADVANCE_WEEKS\"},\"value\":{\"N\":\"8\"}}' &&
        aws dynamodb put-item --table-name duseum-local-config \
          --item '{\"PK\":{\"S\":\"DAILY_FEATURED_EXCLUSIONS\"},\"authorIds\":{\"L\":[]}}' &&

        echo '=== Creating S3 buckets ===' &&
        aws s3 mb s3://duseum-local-media &&
        aws s3 mb s3://duseum-local-spa &&

        echo '=== Creating SQS queues ===' &&
        aws sqs create-queue --queue-name duseum-local-stripe-webhooks &&
        aws sqs create-queue --queue-name duseum-local-stripe-webhooks-dlq &&
        aws sqs create-queue --queue-name duseum-local-notifications &&
        aws sqs create-queue --queue-name duseum-local-notifications-dlq &&
        aws sqs create-queue --queue-name duseum-local-notifications &&
        aws sqs create-queue --queue-name duseum-local-notifications-dlq &&

        echo '=== Creating Secrets Manager secrets ===' &&
        aws secretsmanager create-secret \
          --name duseum/local/stripe/secret-key \
          --secret-string sk_test_REPLACE_WITH_YOUR_TEST_KEY &&
        aws secretsmanager create-secret \
          --name duseum/local/stripe/webhook-secret \
          --secret-string whsec_REPLACE_WITH_YOUR_WEBHOOK_SECRET &&
        aws secretsmanager create-secret \
          --name duseum/local/cloudfront/private-key \
          --secret-string LOCAL_STUB_NOT_USED_FOR_SIGNING &&
        aws secretsmanager create-secret \
          --name duseum/local/ses/from-address \
          --secret-string no-reply@duseum.com &&
        aws secretsmanager create-secret \
          --name duseum/local/notifications/unsubscribe-secret \
          --secret-string local-dev-unsubscribe-hmac-secret &&

        echo '=== Verifying SES email identity (local — auto-approved by MiniStack) ===' &&
        aws ses verify-email-identity --email-address no-reply@duseum.com &&

        echo '=== Creating EventBridge rules ===' &&
        aws events put-rule \
          --name duseum-local-daily-featured-author \
          --schedule-expression 'cron(0 0 * * ? *)' \
          --state ENABLED &&
        aws events put-rule \
          --name duseum-local-weekly-feature-rotation \
          --schedule-expression 'cron(0 0 ? * MON *)' \
          --state ENABLED &&

        echo '=== MiniStack init complete ==='
      "

volumes:
  ministack-data:
```

### 16.2 How MiniStack Replaces AWS Services Locally

| AWS Service | MiniStack at `localhost:4566` | Used by |
|---|---|---|
| DynamoDB | Fully emulated — same SDK calls, same table/GSI definitions | All Lambdas |
| S3 | Fully emulated — objects accessible at `localhost:4566/{bucket}/{key}` | `media-lambda`, `artworks-lambda` |
| SQS | Fully emulated — same queue URLs, same `ReceiveMessage`/`DeleteMessage` | `subscriptions-webhook-lambda`, `artworks-lambda` (send), `notifications-lambda` (receive) |
| SES | Fully emulated — emails captured in MiniStack logs (not actually sent) | `notifications-lambda` |
| Secrets Manager | Fully emulated — stores Stripe keys locally | All Lambdas at cold start |
| SSM Parameter Store | Fully emulated | Config reads in integration tests |

**AWS SDK configuration for local dev**: Lambda functions check for `AWS_ENDPOINT_URL` environment variable. When set, all SDK clients use that URL instead of the real AWS endpoint — the only change needed to support both local (MiniStack) and cloud (real AWS):

```typescript
// packages/shared/src/db/client.ts
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
  // When AWS_ENDPOINT_URL is set (local dev), SDK uses MiniStack.
  // In production Lambda, this env var is absent → real AWS endpoint used.
  ...(process.env.AWS_ENDPOINT_URL && {
    endpoint: process.env.AWS_ENDPOINT_URL
  })
})

export const docClient = DynamoDBDocumentClient.from(dynamoClient)
export const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME!
```

Same pattern for `S3Client`, `SQSClient`, `SecretsManagerClient`.

> **No `awslocal` wrapper needed.** MiniStack uses the standard `AWS_ENDPOINT_URL` mechanism supported natively by the AWS SDK v3. All AWS CLI and SDK calls work identically against MiniStack as they do against real AWS — just with a different endpoint.

### 16.3 Running Lambdas Locally

Lambda functions are invoked directly as Node.js processes (no Docker, no SAM, no serverless-offline):

```bash
# Start all Lambdas via a local HTTP server (hot-reload with tsx watch)
npm run dev:lambdas

# This script:
# 1. Loads .env.local (sets AWS_ENDPOINT_URL=http://localhost:4566)
# 2. Starts a thin Express server (scripts/local-lambda-server.ts)
# 3. Routes requests to Lambda handlers by path prefix
# 4. In LOCAL mode, Middy cognitoAuthMiddleware uses a dev-mode auth stub
#    (reads X-Dev-User-Id header as the userId — no Cognito JWT needed locally)
```

**`scripts/local-lambda-server.ts`**:
```typescript
import express from 'express'
import { handler as artworksHandler }           from '../lambdas/artworks/src/handler'
import { handler as usersHandler }              from '../lambdas/users/src/handler'
import { handler as subscriptionsHandler }      from '../lambdas/subscriptions/src/handler'
import { handler as subscriptionsWebhookHandler } from '../lambdas/subscriptions-webhook/src/handler'
import { handler as socialHandler }             from '../lambdas/social/src/handler'
import { handler as adminHandler }              from '../lambdas/admin/src/handler'
import { handler as mediaHandler }              from '../lambdas/media/src/handler'
import { toApiGwEvent, fromLambdaResult }       from './local-adapter'

const app = express()
app.use(express.raw({ type: '*/*', limit: '25mb' }))

app.all('/artworks*',      (req, res) => invokeLambda(artworksHandler, req, res))
app.all('/users*',         (req, res) => invokeLambda(usersHandler, req, res))
app.all('/subscriptions*', (req, res) => invokeLambda(subscriptionsHandler, req, res))
app.all('/webhooks/stripe',(req, res) => invokeLambda(subscriptionsWebhookHandler, req, res))
app.all('/comments*',      (req, res) => invokeLambda(socialHandler, req, res))
app.all('/reactions*',     (req, res) => invokeLambda(socialHandler, req, res))
app.all('/admin*',         (req, res) => invokeLambda(adminHandler, req, res))
app.all('/media*',         (req, res) => invokeLambda(mediaHandler, req, res))

const invokeLambda = async (handler: Function, req: express.Request, res: express.Response) => {
  const event = toApiGwEvent(req)       // converts Express request to APIGatewayProxyEventV2
  const result = await handler(event, {} as any)
  fromLambdaResult(result, res)         // writes Lambda result back to Express response
}

app.listen(3001, () => console.log('Local Lambda server running at http://localhost:3001'))
```

### 16.4 Running the Frontend Locally

```bash
cd frontend
npm run dev
# Vite dev server at http://localhost:5173
# API calls proxied to http://localhost:3001 (local Lambda server)
```

**`frontend/vite.config.ts`**:
```typescript
export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://localhost:3001'
    }
  }
})
```

### 16.5 Stripe Webhooks Locally

```bash
# Forward Stripe test events to the local Lambda webhook handler
stripe listen --forward-to http://localhost:3001/webhooks/stripe

# Trigger specific events manually
stripe trigger customer.subscription.created
stripe trigger invoice.payment_failed
stripe trigger customer.subscription.deleted
```

The `subscriptions-webhook-lambda` verifies the Stripe signature using the `whsec_*` secret from the Stripe CLI output. Store this in `.env.local` as `STRIPE_WEBHOOK_SECRET`.

### 16.6 Running All Tests Locally

```bash
# Unit tests (no external deps — runs without MiniStack)
npm run test

# Integration tests (requires MiniStack running)
docker-compose up -d ministack ministack-init
npm run test:integration

# E2E tests (requires full local stack running)
docker-compose up -d
npm run dev:lambdas &
cd frontend && npm run dev &
npx playwright test
```

### 16.7 Local Environment Variables

**`.env.example`** (committed to repo — no real secrets):
```bash
# ── Environment ──────────────────────────────────────────────────────────────
ENVIRONMENT=local

# ── DynamoDB (MiniStack) ─────────────────────────────────────────────────────
DYNAMODB_TABLE_NAME=duseum-local
IDEMPOTENCY_TABLE_NAME=duseum-local-idempotency
CONFIG_TABLE_NAME=duseum-local-config

# ── S3 / Media (MiniStack) ───────────────────────────────────────────────────
S3_MEDIA_BUCKET=duseum-local-media
CLOUDFRONT_MEDIA_DOMAIN=localhost:4566   # MiniStack S3 serves objects at this URL locally

# ── SQS (MiniStack) ──────────────────────────────────────────────────────────
STRIPE_WEBHOOK_QUEUE_URL=http://localhost:4566/000000000000/duseum-local-stripe-webhooks
NOTIFICATION_QUEUE_URL=http://localhost:4566/000000000000/duseum-local-notifications

# ── Email / SES (MiniStack — emails are captured in logs, not delivered) ─────
SES_FROM_EMAIL=no-reply@duseum.com
# Note: In local dev, SES sends are intercepted by MiniStack.
# Inspect sent emails: docker-compose logs -f ministack | grep -i ses
# The unsubscribe secret below is a local stub — replace with a real secret in prod:
UNSUBSCRIBE_HMAC_SECRET=local-dev-unsubscribe-hmac-secret

# ── AWS / MiniStack ──────────────────────────────────────────────────────────
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test                   # MiniStack accepts any non-empty value
AWS_SECRET_ACCESS_KEY=test

# ── Cognito (stubbed in local dev) ───────────────────────────────────────────
COGNITO_USER_POOL_ID=local-stub          # unused locally; auth middleware uses X-Dev-User-Id header
COGNITO_CLIENT_ID=local-stub

# ── Stripe (real test keys — needed for Stripe CLI webhook forwarding) ────────
STRIPE_SECRET_KEY=sk_test_REPLACE_WITH_YOUR_TEST_KEY
STRIPE_WEBHOOK_SECRET=whsec_REPLACE_WITH_STRIPE_CLI_OUTPUT

# ── CloudFront (signing stubbed locally) ─────────────────────────────────────
CLOUDFRONT_KEY_PAIR_ID=local-stub        # signed URLs not generated locally; plain S3 URL returned

# ── maintenance-lambda EventBridge rule names ────────────────────────────────
DAILY_FEATURE_RULE_NAME=duseum-local-daily-featured-author
WEEKLY_ROTATION_RULE_NAME=duseum-local-weekly-feature-rotation
# Note: In local dev, trigger these manually instead of waiting for the schedule:
#   npm run invoke:maintenance:daily     (triggers daily featured author selection)
#   npm run invoke:maintenance:weekly    (triggers weekly feature rotation)
```

**`.env.local`** (gitignored — copy from `.env.example`, fill in real Stripe test keys).

---

*Duseum PROJECT.md — v1.3 — Single Source of Truth for AI-Assisted Development*