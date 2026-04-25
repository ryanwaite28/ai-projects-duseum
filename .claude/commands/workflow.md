# /workflow

**The single entrypoint for all Duseum implementation and reconciliation work.**

Run this at the start of every session. It audits the project, surfaces gaps and drift, drives the
design → approval → implementation loop in the correct dependency order, and reconciles specs and
designs against the actual codebase. You do not need to run any other skill directly.

## Usage

```
/workflow                          — full audit + interactive session
/workflow status                   — read-only dashboard, no prompts
/workflow reconcile                — gap check + drift detection only
/workflow specs/{domain}/{file}.md — jump directly to a specific spec
```

---

## Phase 0: Load context

At the start of every session, read:
- `.claude/CLAUDE.md` — project rules (already loaded; acknowledge key constraints)
- `specs/data-model.md` — canonical DynamoDB record shapes
- `specs/shared/types.md` — canonical TypeScript interfaces
- `specs/shared/test-infrastructure.md` — test setup pattern

These four documents are the foundation. Every implementation decision references them.

---

## Phase 1: Full audit

Run all four checks every time. Surface issues before recommending any action.

### 1a. FR coverage check

```bash
grep -oE 'FR-[A-Z]+-[0-9]+[a-z]?' PROJECT.md | sort -u
grep -rhoE 'FR-[A-Z]+-[0-9]+[a-z]?' specs/ | sort -u
```

Compare. Categorize:
- ✅ **Covered**: FR appears in at least one spec file
- ❌ **Missing**: FR in PROJECT.md but in no spec — create stub immediately
- ⚠️ **Orphaned**: FR in specs but not in PROJECT.md — flag for review, do not auto-delete

### 1b. Spec status scan

For every `.md` under `specs/` (exclude `README.md`, `data-model.md`, `shared/`):
- Extract `**Status**` — must be exactly `⬜ Pending` or `✅ Implemented`
- Any other value (e.g., "partial") → **malformed** — flag and fix immediately
- For `⬜ Pending` specs: count `- [x]` vs `- [ ]` in `**Done when**`
- For `✅ Implemented` specs: verify all `Done when` items are `[x]`; if any `[ ]` remain → **incomplete**

### 1c. Design status scan

For every spec, check `designs/{domain}/{spec-name}.md`:
- `🔒 Implemented` — matches a completed spec
- `✅ Approved` — ready for implementation
- `⬜ Draft` — created but not yet reviewed
- `—` (missing) — no design exists yet

Flag mismatches:
- `✅ Implemented` spec with `—` or `⬜ Draft` design → run retroactive design immediately
- `✅ Approved` design with `✅ Implemented` spec → update design to `🔒 Implemented`
- `✅ Implemented` spec with `✅ Approved` design (not yet locked) → lock the design

### 1d. Prerequisite graph

For each `⬜ Pending` spec, parse its `**Prerequisites**` for spec filenames. Determine:
- ✅ **Ready**: all referenced prerequisite specs are `✅ Implemented`
- 🔴 **Blocked**: one or more prerequisite specs are `⬜ Pending` — list which ones

Build the full dependency graph to find the critical path (which specs, when done, unblock the most work).

### 1e. Reconciliation drift check (always run, not just in reconcile mode)

```bash
git diff --name-only main 2>/dev/null || git diff --name-only HEAD~1 2>/dev/null
```

For any modified or new `.ts` files: check whether they appear in at least one spec's `**New/modified files**`. Any file not covered by a spec is **untracked** — flag it.

Also check: for each `✅ Implemented` spec, scan its design's `**DynamoDB Record Shapes**` table for attribute names. Cross-reference against the actual repository file. Flag any attribute name in the design that does not appear in the code (indicating design drift).

---

## Phase 2: Dashboard

Print the full project status. Always print this before taking any action.

```
═══════════════════════════════════════════════════════
  DUSEUM — Project Workflow Dashboard  ({date})
═══════════════════════════════════════════════════════

PROGRESS
  Specs implemented:  {n}/{total}  ({pct}%)
  Designs complete:   {n} 🔒  |  {n} ✅ Approved  |  {n} ⬜ Draft  |  {n} — Missing
  FR coverage:        {n}/{total} FRs covered

AUDIT ISSUES  (fix these before proceeding)
  ❌ Missing FRs:     {list or "none"}
  ⚠️  Orphaned FRs:   {list or "none"}
  ⚠️  Malformed specs: {list or "none"}
  ⚠️  Untracked files: {list or "none"}
  ⚠️  Design drift:    {list or "none"}

PIPELINE
  ▶ Ready to implement  (design ✅ Approved + prerequisites ✅):
      {list or "none — run /workflow to design a spec first"}

  ◆ Ready to design  (prerequisites ✅, no approved design):
      {list — recommended order by dependency depth}

  ● Blocked  (prerequisites ⬜ Pending):
      {spec} — waiting on: {prereq list}
═══════════════════════════════════════════════════════
```

---

## Phase 3: Reconcile audit issues first

If any audit issues exist, address them before proceeding to design or implementation:

**Missing FRs** → create spec stubs using this format:
```markdown
## Spec: {Descriptive Name}

**Status**: ⬜ Pending
**FR coverage**: {FR-XXX-YY}
**Relevant PROJECT.md sections**: {section}
**What this implements**: TODO

**Prerequisites**: TODO

**Done when**:
- [ ] TODO
- [ ] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- TODO

**DynamoDB access patterns used**:
- TODO

**Business logic**:
- TODO

**Tests to write**:
- TODO
```

**Malformed spec status** → correct the `**Status**` field to `⬜ Pending` or `✅ Implemented`.

**Missing retroactive design** (✅ Implemented spec with no design) → run the retroactive design flow:
- Read the spec and its listed implementation files
- Produce `designs/{domain}/{spec-name}.md` with `**Status**: 🔒 Implemented`
- No approval needed for retroactive designs

**Design/spec status mismatch** → fix the design file's `**Status**` to match reality.

**Untracked files** → surface for human review:
```
⚠️ The following files were modified but do not appear in any spec's New/modified files:
   - lambdas/users/src/routes/some-new-route.ts
   → Action needed: either add this file to an existing spec, or create a new spec covering it.
```

**Design drift** → surface for human review:
```
⚠️ Design drift detected in designs/infrastructure/storage-stack.md:
   - data-model.md documents GSI1/GSI2/GSI3; actual code uses GSI-AuthorPublic, GSI-AllPublicPieces, etc.
   - data-model.md documents idempotency table as PK+SK; actual table is PK-only
   → Action needed: update specs/data-model.md to match actual implementation
```

After fixing all audit issues, proceed to Phase 4.

---

## Phase 4: Action selection

Using the pipeline from Phase 2, determine the recommended next action.

**Priority order:**
1. Fix audit issues (Phase 3) — always first
2. Implement a spec that has `✅ Approved` design and met prerequisites
3. Design a spec that has met prerequisites and no approved design
4. If nothing is immediately actionable — show the blocking dependency chain

**Dependency-first ordering** for design/implement recommendations:
- Infrastructure specs before Lambda specs before Frontend specs
- Within the same layer: specs with no pending prerequisites before specs that unblock others
- Prefer the spec on the critical path (unblocking the most downstream work)

Present the recommendation:
```
═══════════════════════════════════════════════════════
  RECOMMENDED NEXT ACTION
═══════════════════════════════════════════════════════
  ▶ Implement: specs/social/reactions.md
    Design: ✅ Approved  |  Prerequisites: ✅ All met
    FR coverage: FR-SOC-01, FR-VIEW-07
    Done when: 0/5 criteria checked

  Other options:
    ◆ Design: specs/social/comments.md
    ◆ Design: specs/features/daily-featured.md
    ◆ Design: specs/notifications/new-piece-fanout.md

  Type the spec path to work on it, or press Enter to proceed with the recommendation.
═══════════════════════════════════════════════════════
```

Wait for user confirmation or a different selection.

---

## Phase 5: Execute

### If designing (⬜ Pending spec with no ✅ Approved design)

1. Read the spec file — extract every field
2. Read PROJECT.md sections listed in `**Relevant PROJECT.md sections**`
3. Read `specs/data-model.md` and `specs/shared/types.md`
4. Read any existing shared files this spec will modify (repository files, types file)
5. Read any existing design for this spec (if `⬜ Draft` already exists, update it)
6. Produce `designs/{domain}/{spec-name}.md` with:
   - `**Status**: ⬜ Draft`
   - Exact TypeScript interfaces (referencing `specs/shared/types.md` for existing ones)
   - DynamoDB record shapes table with exact attribute names from `specs/data-model.md`
   - Function signatures for every function in `**New/modified files**`
   - Middy handler boilerplate (or CDK construct patterns for infrastructure specs)
   - Implementation steps — concrete, one-file-per-step, with exact attribute names and ConditionExpressions
   - Integration test fixtures — exact seed data and assertion shapes
   - Decisions & constraints — non-obvious choices, CLAUDE.md constraints that apply
7. Present the design inline. Print:
   ```
   ──────────────────────────────────────────────
     Design draft: designs/{domain}/{spec-name}.md
   ──────────────────────────────────────────────
   {design content printed here}
   ──────────────────────────────────────────────
   Review the design above.

   Reply with one of:
     "Approved"                  → approve and proceed to implementation
     "Approved, skip implement"  → approve but do not implement yet
     "Revise: {your feedback}"   → update design and re-present
     "Cancel"                    → discard draft
   ──────────────────────────────────────────────
   ```

8. **Approval handling:**

   | Response | Action |
   |---|---|
   | "Approved" | Set design `**Status**: ✅ Approved` + `**Approved**: {date}` → proceed to implementation |
   | "Approved, skip implement" | Set design `**Status**: ✅ Approved` → return to Phase 4 |
   | "Revise: {feedback}" | Update design based on feedback → re-present → wait again |
   | "Cancel" | Delete draft design file → return to Phase 4 |

### If implementing (spec with `✅ Approved` design + met prerequisites)

**Gate 1 — Design check** (hard stop):
Read `designs/{domain}/{spec-name}.md`. If `**Status**` is not `✅ Approved` or `🔒 Implemented`:
→ "Design is not approved. Returning to design phase." → go to design step.

**Gate 2 — Prerequisites check** (hard stop):
For each referenced spec in `**Prerequisites**`: if not `✅ Implemented`:
→ "Prerequisite `{spec}` is not implemented. Work on that first." → update recommendation.

**Implementation:**
1. Read the approved design — this is the authoritative guide
2. Read `specs/data-model.md` — verify attribute names one more time
3. Read all existing files listed in `**New/modified files**`
4. Execute the design's **Implementation Steps** in order:
   - Use exact attribute names, function signatures, and ConditionExpressions from the design
   - Apply all CLAUDE.md rules (no hardcoded ARNs, AppError subclasses, no PII logging, etc.)
   - If a step reveals the design needs a change → stop, update the design, re-present for approval

5. **TypeScript compilation** (required before tests):
   ```bash
   turbo run typecheck
   ```
   Fix all errors before continuing. Do not run tests on type-broken code.

6. **Tests:**
   ```bash
   # Lambda package:
   cd lambdas/{name} && npx vitest run

   # Shared package:
   cd packages/shared && npx vitest run

   # CDK spec:
   cd infrastructure && npx cdk synth --strict --context env=dev
   ```
   Fix all failures before marking complete.

7. **Tick Done when items:**
   Edit the spec file — change `- [ ]` → `- [x]` for each satisfied criterion.
   For infrastructure items requiring CLI verification, add:
   ```
   ⚠️ Human verify: aws {command} --profile rmw-llc
   ```

8. **Update statuses:**
   - Spec: `**Status**: ⬜ Pending` → `**Status**: ✅ Implemented`
   - Design: `**Status**: ✅ Approved` → `**Status**: 🔒 Implemented`

---

## Phase 6: Post-action and loop

After any completed action, print:

```
✅ {Spec name} — {Designed | Implemented}
   Progress: {n}/{total} specs implemented ({pct}%)
   Designs:  {n} 🔒 | {n} ✅ | {n} ⬜ | {n} —
```

Then immediately suggest the next action using the updated pipeline. Ask:
```
Continue with the next recommended action? (Y / choose a spec path / "done" to exit)
```

Loop back to Phase 2 (abbreviated — skip full audit unless the user types `/workflow reconcile`).

---

## Reconcile mode (`/workflow reconcile`)

Run this when:
- Code has changed outside the spec workflow (direct commits, hotfixes)
- PROJECT.md has been updated with new or changed FRs
- Designs seem out of date with the actual code
- Onboarding a new session after a long break

Additional checks beyond the standard audit:

**Deep drift detection:**
For each `✅ Implemented` spec with a `🔒` design:
- Read the design's `**Function Signatures**` section
- Read the actual implementation file(s)
- Flag: function names present in design but not in code; attribute names in DynamoDB shapes not matching code

**Full data-model check:**
For each record type in `specs/data-model.md`:
- Find the corresponding repository function that writes it
- Verify the PK/SK format and key attribute names match exactly
- Report any discrepancy as a data-model drift issue

**Example reconcile output:**
```
═══════════════════════════════════════════════════════
  RECONCILE REPORT — {date}
═══════════════════════════════════════════════════════

FR COVERAGE: 109/109 ✅ No gaps

DESIGN DRIFT DETECTED:
  specs/data-model.md vs actual code:
    ✗ GSI1/GSI2/GSI3 (data-model) → actual: GSI-AuthorPublic, GSI-AllPublicPieces, etc.
    ✗ Idempotency table documented as PK+SK → actual: PK-only
    ✗ UserAccount SK documented as META → actual: PROFILE
    Action: update specs/data-model.md (3 changes)

UNTRACKED FILES:
  (none)

SPEC/DESIGN MISMATCHES:
  (none)

RECOMMENDED FIXES:
  1. Update specs/data-model.md — GSI names, idempotency table schema, UserAccount SK
  2. Update specs/shared/types.md — UserAccount interface SK field

Proceed with fixes? (Y / N)
═══════════════════════════════════════════════════════
```

When the user confirms, apply the fixes to the reference documents.

---

## Status mode (`/workflow status`)

Prints the dashboard from Phase 2 plus the pipeline from Phase 4. No prompts, no actions.
Use this for a quick orientation without committing to any work.

---

## Direct mode (`/workflow specs/{domain}/{file}.md`)

Jump directly to the design or implementation phase for a specific spec.

1. Read the spec status
2. Read the design status
3. If `⬜ Pending` spec + no `✅ Approved` design → go to design phase (Phase 5, design branch)
4. If `⬜ Pending` spec + `✅ Approved` design → go to implementation phase (Phase 5, implement branch)
5. If `✅ Implemented` spec → "This spec is already implemented. Run `/workflow reconcile` to check for drift."

Still runs prerequisite check before acting.

---

## Invariants — never violate these

- **Never implement without `✅ Approved` design.** If the design gate fails, go back to the design step.
- **Never implement with unmet prerequisites.** Offer to work on the blocking spec instead.
- **Never mark `✅ Implemented` with unchecked `Done when` items.**
- **Never skip `turbo run typecheck`** before running vitest.
- **Never modify `specs/data-model.md` or `specs/shared/types.md` without surfacing the change** to the user — these are shared references used by all designs.
- **Never invent implementation details** not in the design. If the design is incomplete, update it and get re-approval before continuing.
- **Reconcile issues take priority** over new design or implementation work. Fix drift before building on top of it.
