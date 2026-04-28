---
description: Product/project manager review — cross-references the live frontend route table against PROJECT.md functional requirements to produce a prioritized gap report. Run after any significant frontend change to verify MVP completeness.
---

When this skill is invoked, act as a senior product owner performing a structured MVP completeness audit. Do the following steps in order without skipping any.

## Step 1 — Gather inputs (read all four, no shortcuts)

1. Read `frontend/src/App.tsx` — extract the complete route inventory (path, element, wrapper)
2. Read `frontend/src/components/layout/NavBar.tsx` — determine which routes are reachable via navigation
3. Read `PROJECT.md` Section 1.2 (How It Works) and Section 1.3 (Key Personas) — understand the three core user journeys
4. Read `PROJECT.md` Sections 2.1–2.12 — collect every FR-* requirement

---

## Step 2 — Produce the report (all sections required)

### A. Route Inventory

Table with one row per route from App.tsx:

| Path | Route guard | Nav-reachable | FR reference(s) |
|------|-------------|---------------|-----------------|

**Route guard values**: `public` / `ProtectedRoute` / `AdminRoute` / `Stripe-redirect`
**Nav-reachable values**: `top-nav` / `user-menu` / `Stripe-redirect-only` / `email-link-only` / `orphaned`

Flag any route that is `orphaned` — reachable only by typing the URL directly.

---

### B. Functional Requirements Coverage

For every FR-* identifier in PROJECT.md Sections 2.1–2.12, one row:

| FR | Description (short) | Status | Notes |
|----|---------------------|--------|-------|

**Status values**:
- ✅ **Implemented** — frontend route + service/API call both exist and are wired
- ⚠️ **Partial** — route exists but key part of the flow is incomplete or broken
- ❌ **Missing** — no route, no UI, or no API caller
- 🔧 **Backend-only** — infrastructure/Lambda concern with no required frontend surface

---

### C. Core Journey Health

Score each of the three journeys from PROJECT.md Section 1.2. For every named step, mark ✅ works / ⚠️ degraded / ❌ broken.

**Journey 1 — Art lover discovers and subscribes**
> Visitor → Home → Browse → Author Profile → Follow → Subscribe to Platform → Subscribe to Author → Access Private Content

**Journey 2 — Creator becomes an Author and earns**
> Register → Verify Email → (auto Viewer created) → Account Dashboard → Become Author → Onboarding → Publish First Piece → Connect Stripe → Set Subscription Price → Book Weekly Feature

**Journey 3 — Returning authenticated user navigates their account**
> Sign In → Land somewhere useful → Switch between Viewer view and Author view → Manage subscriptions → Update notification prefs → Sign Out

Give each journey an overall health rating: 🟢 Healthy / 🟡 Degraded / 🔴 Broken.

---

### D. Prioritized Gap List

Group gaps by priority. For each gap include: what's missing, which FR(s) it affects, and a one-line recommended fix.

**P0 — Blocks a core journey (ship-stopper)**

**P1 — Degrades experience but workaround exists**

**P2 — Polish / completeness / nice-to-have**

---

### E. Quick Stats

End with a summary box:

```
Routes total:          X
Routes orphaned:       X  (list them)
Routes unprotected:    X  (list any that should be protected)
FRs total:             X
FRs implemented (✅):  X  (Y%)
FRs partial (⚠️):      X
FRs missing (❌):      X
Journey 1 health:      🟢/🟡/🔴
Journey 2 health:      🟢/🟡/🔴
Journey 3 health:      🟢/🟡/🔴
```

---

## Tone and format rules

- Be direct and specific — name the missing file or endpoint, not just the concept
- Do not pad the report with praise or summary paragraphs
- If a gap was already identified in a previous `/pm-review` run and is still present, note it as a **recurring gap**
- Flag anything that would cause a real user to hit a dead end, an error screen, or need to manually type a URL
