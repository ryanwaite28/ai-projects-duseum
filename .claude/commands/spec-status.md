# /spec-status

Print a completion dashboard showing status of every spec, its design approval state, and Done when progress. Suggests the next spec to implement based on satisfied prerequisites and approved designs.

## Steps

### 1. Scan spec files

For each `.md` file under `specs/` (excluding `specs/README.md`, `specs/data-model.md`, `specs/shared/`):

Extract:
- File path and domain (parent directory name)
- `**Status**` value — exactly one of: `⬜ Pending` or `✅ Implemented`
- `Done when` checklist: count `- [x]` (done) vs `- [ ]` (pending) items
- `**Prerequisites**` value (for suggestion logic)

### 2. Scan design files

For each spec file found, check whether `designs/{domain}/{spec-name}.md` exists. If it does, extract its `**Status**`:
- `⬜ Draft`
- `✅ Approved`
- `🔒 Implemented`
- (missing) → `—`

### 3. Print dashboard

Group by domain. For each spec print one line:

```
{spec-status} {filename}  [{design-status}]  ({done}/{total} criteria)
```

Where:
- `spec-status`: `✅` (Implemented) or `⬜` (Pending)
- `design-status`: `🔒` (Implemented), `✅` (Approved), `⬜` (Draft), or `—` (no design)
- `done/total`: Done when checkbox count — omit for ✅ Implemented specs

Example output:

```
## Spec Status — 2026-04-25

### Auth
✅ cognito-registration.md     [🔒]
✅ post-confirmation.md        [🔒]

### Users
✅ profile-crud.md             [🔒]
✅ author-onboarding.md        [🔒]
✅ author-directory.md         [🔒]
✅ follows.md                  [🔒]
✅ notification-preferences.md [🔒]

### Artworks
✅ upload-intent.md            [🔒]
✅ artwork-crud.md             [🔒]
✅ access-control.md           [🔒]
✅ collections-crud.md         [🔒]
✅ collection-pieces.md        [🔒]

### Subscriptions
✅ platform-checkout.md        [🔒]
✅ author-checkout.md          [🔒]
✅ webhook-processing.md       [🔒]
✅ connect-onboarding.md       [🔒]
✅ subscription-price.md       [🔒]

### Social
⬜ comments.md                 [—]   (0/7 criteria)
⬜ reactions.md                [—]   (0/5 criteria)

### Notifications
⬜ new-piece-fanout.md         [—]   (0/9 criteria)

### Features
⬜ daily-featured.md           [—]   (0/6 criteria)
⬜ weekly-booking.md           [—]   (0/7 criteria)
⬜ maintenance-rotation.md     [—]   (0/5 criteria)

### Admin
⬜ user-management.md          [—]   (0/5 criteria)
⬜ feature-management.md       [—]   (0/5 criteria)
⬜ platform-config.md          [—]   (0/4 criteria)

### Discovery
⬜ browse-artworks.md          [—]   (0/5 criteria)

### Infrastructure
✅ storage-stack.md            [🔒]
✅ auth-stack.md               [🔒]
✅ messaging-stack.md          [🔒]
✅ api-stack.md                [🔒]
✅ cdn-stack.md                [🔒]
⬜ monitoring-stack.md         [—]   (0/5 criteria)
✅ cicd.md                     [🔒]

### Frontend
⬜ auth-ui.md                  [—]   (0/6 criteria)
⬜ browse-gallery-ui.md        [—]   (0/7 criteria)
⬜ subscription-ui.md          [—]   (3/6 criteria)
⬜ social-ui.md                [—]   (0/6 criteria)
⬜ author-dashboard-ui.md      [—]   (2/7 criteria)
⬜ admin-panel-ui.md           [—]   (0/6 criteria)
⬜ featured-ui.md              [—]   (0/6 criteria)

---
Progress: 23 / 41 specs implemented  (56%)
Designs:  23 🔒 Implemented | 0 ✅ Approved | 0 ⬜ Draft | 18 — Missing
```

### 4. Implementation pipeline

Print two lists:

**Ready to implement** — `⬜ Pending` specs where:
- All prerequisite *spec files* are `✅ Implemented`
- Design is `✅ Approved`

**Ready to design** — `⬜ Pending` specs where:
- All prerequisite *spec files* are `✅ Implemented`
- No design exists yet (or design is `⬜ Draft`)

```
## Implementation Pipeline

### Ready to implement (design approved, prerequisites met):
  (none yet — run /design on a spec first)

### Ready to design (prerequisites met, no design yet):
  💡 /design specs/social/reactions.md
  💡 /design specs/social/comments.md
  💡 /design specs/features/daily-featured.md
  💡 /design specs/discovery/browse-artworks.md
  💡 /design specs/infrastructure/monitoring-stack.md
  💡 /design specs/frontend/auth-ui.md
  💡 /design specs/frontend/browse-gallery-ui.md
  💡 /design specs/frontend/subscription-ui.md
  💡 /design specs/frontend/author-dashboard-ui.md

### Blocked (prerequisites not yet implemented):
  🔴 specs/notifications/new-piece-fanout.md — waiting on: follows.md ✅, notification-preferences.md ✅
     (all prerequisites actually met — check manually)
  🔴 specs/features/weekly-booking.md — waiting on: daily-featured.md ⬜
  🔴 specs/features/maintenance-rotation.md — waiting on: weekly-booking.md ⬜
  🔴 specs/admin/feature-management.md — waiting on: weekly-booking.md ⬜
```

### 5. Prerequisite resolution logic

For each `⬜ Pending` spec, parse its `**Prerequisites**` field. Extract any mention of another spec file (e.g., "`artwork-crud.md` complete", "`follows.md` complete"). Check that spec's `**Status**`.

- All referenced specs are `✅ Implemented` → prerequisites met
- Any referenced spec is `⬜ Pending` → blocked (show which one is blocking)

---

## Notes

- `**Status**` in spec files has exactly two values: `⬜ Pending` or `✅ Implemented`. Any other value (e.g., "partial") is a malformed status — report it as an error.
- Design status is read from `designs/{domain}/{spec-name}.md` — a separate file from the spec.
- The dashboard is read-only — it never modifies spec or design files.
- Run `/spec-status` at the start of any session to orient yourself, after completing a spec, or after running `/sync-specs`.
