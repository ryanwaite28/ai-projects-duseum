# Duseum

**A production-grade, fully serverless digital museum platform** — built as a portfolio project demonstrating end-to-end AWS architecture, backend engineering, DevOps, and frontend development across a real-world creative domain.

> Live app: **[duseum.com](https://duseum.com)** · Dev environment: **[dev.duseum.com](https://dev.duseum.com)**

---

## What It Is

Duseum is an online museum where artists publish their work and art lovers discover and support creators directly. The platform is built around a **dual-profile model**: every account can hold a Viewer profile for browsing and an Author profile for publishing — simultaneously.

Access is gated by a layered subscription system:

| Who | What they can see |
|---|---|
| Free Viewer | A curated free tier of public artwork per Author |
| Platform Subscriber | Unlimited public artwork from all Authors |
| Author Subscriber | A specific Author's private collection |
| Author | Their own content at all visibility levels |

Authors can also pay to be **Featured on the homepage** — either as the randomly-selected Daily Featured Author (free, automatic) or as a paid Weekly Featured Author booking a specific calendar week.

---

## Skills Demonstrated

### AWS & Cloud Architecture

- **Serverless-first design** — 11 independent Lambda functions, zero always-on compute
- **AWS CDK (TypeScript)** — infrastructure as code across 7 stacks: Storage, Auth, CDN, Messaging, API, Monitoring, Networking
- **DynamoDB single-table design** — 7 GSIs, pre-defined access patterns, no full scans
- **Amazon Cognito** — User Pool with Google OAuth federation, JWT-based sessions (access + refresh token rotation), Post-Confirmation Lambda trigger for auto-profile creation
- **CloudFront signed URLs** — private art pieces served via time-limited signed URLs; signing happens in Lambda, never in the browser
- **S3 + CloudFront CDN** — private media bucket with OAC; SPA bucket with React Router fallback
- **SQS** — two queues: Stripe webhook ingestion (API Gateway → SQS → Lambda, no hot-path Lambda) and new-piece notification fan-out
- **AWS SES** — transactional email for follower notifications with one-click unsubscribe (HMAC-signed tokens, CAN-SPAM compliant)
- **EventBridge scheduled rules** — daily featured Author selection (00:00 UTC) and weekly feature rotation (Monday 00:00 UTC)
- **Secrets Manager** — all Stripe keys, CloudFront signing key pair, HMAC secret; nothing in environment variables or code
- **SSM Parameter Store** — cross-stack wiring; no CDK `Fn.importValue()`
- **CloudWatch alarms + X-Ray tracing** — Lambda error rates, SQS DLQ depth, API 5xx rate, structured JSON logging

### Backend Engineering

- **Node.js 20 + TypeScript 5** throughout
- **Middy 5.x middleware** — auth, validation, error handling, structured logging
- **Modular Lambda pattern** — one Lambda per route group; shared business logic in `packages/shared`
- **Stripe Billing + Connect Express** — platform subscriptions, per-Author subscriptions, Stripe Connect onboarding, application fees, Billing Portal
- **Stripe Payment Intents** — one-time weekly feature booking fee with idempotent webhook processing
- **Webhook idempotency** — DynamoDB idempotency table checked before every Stripe event processed; safe to receive duplicates
- **Async notification fan-out** — publish one SQS message on artwork creation; `notifications-lambda` pages through Follow/Subscriber records and sends SES emails in batches of 50; never blocks the API response
- **Access control at the Lambda layer** — `checkArtPieceAccess()` in shared package; never enforced only in the frontend

### DevOps & CI/CD

- **GitHub Actions** with OIDC-based AWS authentication — no static AWS keys
- **Turborepo** — monorepo build orchestration with caching across 12 workspaces
- **Two-environment pipeline** (dev + prod) within a single shared AWS account using `{env}` resource name prefixes
- **esbuild bundling** — lean Lambda bundles; cold start budget < 1s
- **Smoke tests** post-deploy — curl-based endpoint verification uploaded to S3 as JSON artifacts
- **Integration tests** — Vitest with real DynamoDB/Lambda execution via MiniStack
- **MiniStack (Docker Compose)** — local AWS emulation for DynamoDB, SQS, S3, and SSM; seed scripts for local dev

### Frontend Engineering

- **React 18 + Vite** — SPA with code-split lazy routes
- **React Query (TanStack Query v5)** — server state, paginated lists, optimistic UI mutations
- **Zustand** — lightweight auth store (Cognito session + profile state)
- **Tailwind CSS** — utility-first design system; locked token set (no arbitrary colors)
- **AWS Amplify (Auth)** — Cognito token management, OAuth redirect, refresh rotation
- **Stripe.js + React Stripe Elements** — Payment Intent confirmation for weekly feature booking
- **Custom design system** — Playfair Display + DM Sans + DM Mono; warm editorial palette (ink/parchment/gold); no external component libraries
- **Scroll reveal, drag-and-drop, Fisher-Yates shuffle** — all implemented without adding dependencies

### System Design Patterns

- **Single-table DynamoDB design** with composite keys and explicit GSIs
- **Event-driven architecture** — art piece publish → SQS → fan-out; Stripe webhook → SQS → idempotent handler
- **Spec-Driven Development (SDD)** — every feature gated behind a spec with approval before implementation
- **Dual-environment isolation** — dev and prod on one AWS account, fully isolated by resource naming
- **Configurable platform behavior without deploys** — free tier limits, feature fees, slot counts stored in DynamoDB config table; Admin UI writes them at runtime

---

## Architecture Overview

```
Browser
  └─ CloudFront (duseum.com / dev.duseum.com)
       ├─ S3 SPA Bucket       ← React build (Vite)
       ├─ API Gateway (HTTP API v2)
       │    └─ Lambda functions (per route group)
       │         ├─ artworks-lambda
       │         ├─ users-lambda
       │         ├─ subscriptions-lambda
       │         ├─ features-lambda
       │         ├─ social-lambda
       │         ├─ admin-lambda
       │         ├─ media-lambda
       │         └─ notifications-lambda (SQS trigger)
       └─ S3 Media Bucket     ← Art images (CloudFront signed URLs)

Async layer
  Stripe webhook  → API GW → SQS → subscriptions-webhook-lambda
  POST /artworks  → SQS    → notifications-lambda → SES (follower emails)
  EventBridge     → maintenance-lambda (daily 00:00 UTC + Monday 00:00 UTC)

Auth
  Amazon Cognito User Pool
    └─ Post-Confirmation → auth-triggers-lambda (auto-create Viewer profile)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 LTS, TypeScript 5 |
| Lambda middleware | Middy 5.x |
| Database | DynamoDB (single-table design) |
| Auth | Amazon Cognito User Pool |
| Infrastructure | AWS CDK TypeScript 2.x |
| Frontend | React 18 + Vite + Tailwind CSS |
| State management | Zustand + TanStack Query v5 |
| Payments | Stripe Billing + Stripe Connect Express |
| CDN / Storage | CloudFront signed URLs + S3 |
| Email | AWS SES |
| Messaging | Amazon SQS |
| Scheduling | Amazon EventBridge |
| Secrets | AWS Secrets Manager |
| Config | AWS SSM Parameter Store |
| Monitoring | CloudWatch + X-Ray |
| CI/CD | GitHub Actions + OIDC |
| Monorepo | npm workspaces + Turborepo |
| Local dev | MiniStack (Docker) + Vitest |

---

## Live Environments

| Environment | App | API |
|---|---|---|
| Production | [duseum.com](https://duseum.com) | `api.duseum.com` |
| Development | [dev.duseum.com](https://dev.duseum.com) | `api.dev.duseum.com` |

---

## Repository Structure

```
ai-projects-duseum/
├── frontend/                  React + Vite SPA
│   └── src/
│       ├── pages/             Route-level page components
│       ├── components/        Shared UI components
│       ├── hooks/             React Query + custom hooks
│       ├── services/          API client functions
│       ├── store/             Zustand auth store
│       └── types/             TypeScript interfaces
├── lambdas/                   Lambda functions (one per route group)
│   ├── artworks/
│   ├── users/
│   ├── subscriptions/
│   ├── subscriptions-webhook/
│   ├── features/
│   ├── social/
│   ├── admin/
│   ├── media/
│   ├── notifications/
│   ├── maintenance/
│   └── auth-triggers/
├── packages/
│   └── shared/                Shared business logic (repositories, middleware, Stripe, SES, types)
├── infrastructure/
│   └── stacks/                AWS CDK stacks (Storage, Auth, CDN, API, Messaging, Monitoring)
├── specs/                     Spec-Driven Development: one spec per feature
├── scripts/                   Bootstrap, seed, smoke test, load test
└── .claude/                   AI assistant configuration (CLAUDE.md + custom slash commands)
```

---

## Local Development

```bash
# Prerequisites: Docker, Node.js 20, AWS CLI

# 1. Start local AWS emulation (DynamoDB, SQS, S3, SSM)
docker compose up -d

# 2. Bootstrap local resources
bash scripts/ministack-init.sh

# 3. Seed local data
npx tsx scripts/seed-local.ts

# 4. Start all Lambda dev servers
npx tsx scripts/dev-server.ts

# 5. Start frontend
cd frontend && npm run dev
```

---

## Project Notes

This project was built as a **portfolio piece demonstrating production-grade AI-driven development**. The entire codebase was designed and implemented using Claude Code (Anthropic) with a Spec-Driven Development workflow: every feature was gated behind an explicit spec, reviewed before implementation, and verified with a full monorepo typecheck.

See [RETRO.md](RETRO.md) for the full project retrospective — covering the development process, infrastructure lessons learned, and a recommended process for future AI-driven projects of this scale.

---

*GitHub: [github.com/ryanwaite28/ai-projects-duseum](https://github.com/ryanwaite28/ai-projects-duseum)*
