# /implement-spec

Guided implementation workflow for a single spec file. Verifies design approval, checks prerequisites, implements step-by-step, runs typecheck + tests, and marks the spec complete.

## Usage

```
/implement-spec specs/{domain}/{spec-file}.md
```

If no path is provided, list all specs with `**Status**: ⬜ Pending` that have an `✅ Approved` design, and ask the user to choose one.

---

## Steps

### 1. Load the spec

Read the target spec file. Extract:
- **Status** — abort if already `✅ Implemented`
- **FR coverage**
- **Prerequisites**
- **Done when** checklist
- **New/modified files**
- **Business logic**

### 2. Check design approval (HARD GATE)

Compute the design path: `designs/{domain}/{spec-name}.md` (same path as spec but under `designs/`).

Read the design file. Check its `**Status**` field:

| Design status | Action |
|---|---|
| File does not exist | **STOP**: "No design exists for this spec. Run `/design specs/{domain}/{spec-name}.md` first." |
| `⬜ Draft` | **STOP**: "Design exists but is not approved. Review `designs/{domain}/{spec-name}.md` and reply 'Approved — design is approved.' to the `/design` session." |
| `✅ Approved` | **PROCEED** |
| `🔒 Implemented` | **PROCEED** (retroactive design — implementation matches) |

Do not bypass this gate under any circumstance.

### 3. Check prerequisites

For each item in the spec's **Prerequisites**:
- If it references another spec file (e.g., "`artwork-crud.md` complete"): read that spec and verify its `**Status**` is `✅ Implemented`. If not — **STOP**: "Cannot proceed — prerequisite spec `{name}` is not complete. Implement it first."
- If it references deployed infrastructure or seeded secrets: surface as a human-verifiable prerequisite (do not block, but list prominently).

Print a summary:
```
✅ artwork-crud.md — Implemented
✅ access-control.md — Implemented
⚠️  CloudFront private key in Secrets Manager — verify manually before continuing
```

Only proceed after all spec-file prerequisites are ✅.

### 4. Read the design

Carefully read `designs/{domain}/{spec-name}.md`. This is the authoritative implementation guide — it overrides any ambiguity in the spec. The design contains:
- Exact TypeScript interfaces
- DynamoDB attribute names and ConditionExpressions
- Function signatures
- Handler boilerplate
- Ordered implementation steps
- Integration test fixtures

Do not invent implementation details not in the design. If the design is missing something critical, stop and tell the user to update the design (and get re-approval) before proceeding.

### 5. Read existing files

Read all files listed in the spec's **New/modified files** that already exist on disk. Do not skip this — existing code may have imports, patterns, or shared state that the new code must integrate with.

Also read:
- `packages/shared/src/types/index.ts` (check for existing interfaces)
- `specs/data-model.md` (verify attribute names)

### 6. Implement

Work through the design's **Implementation Steps** in order. For each step:
- Write or edit the file using the exact attribute names, function signatures, and patterns from the design
- Apply all CLAUDE.md rules: no hardcoded ARNs, no full table scans, Middy middleware, AppError subclasses, no PII logging, etc.
- Prefer editing existing files to creating new ones

After writing each file, verify the corresponding **Done when** criterion is satisfied.

### 7. Run TypeScript compilation

```bash
turbo run typecheck
```

**All TypeScript errors must be resolved before proceeding to tests.** TypeScript errors that don't surface as test failures are real errors — do not skip this step.

If typecheck fails: fix the type errors, then re-run before continuing.

### 8. Write tests

**Tests are written here — not discovered later.** Use the design's `**Integration Test Fixtures**` section as the source of truth for seed data and assertion shapes.

For each FR in the spec's `**FR coverage**` list, write at minimum:
- One **integration test** exercising the happy path (real MiniStack DynamoDB, no mocks)
- One **integration test** for each error condition listed in the spec's `**Business logic**`

Tag every `describe` block with the FR code(s) it covers:

```typescript
// lambdas/{name}/src/__tests__/{route}.integration.test.ts
describe('FR-XXX-YY — {FR description}', () => {
  it('happy path: {expected outcome}', async () => { ... });
  it('returns 409 when {conflict condition}', async () => { ... });
  it('returns 403 when {auth condition}', async () => { ... });
});
```

**vitest.config.ts check** — before adding test files to a Lambda that doesn't yet have one, verify its `vitest.config.ts` has `fileParallelism: false`. If missing, add it. Parallel test file execution causes DynamoDB table race conditions (one file's `afterAll` deletes tables mid-test in another file).

**Seed helpers** — use the existing helpers in `src/__tests__/setup.ts`. If a new record type is needed, add a typed seed helper to `setup.ts` before writing the test. Verify the PK/SK format matches `specs/data-model.md` exactly — wrong SK values cause `null` returns from `GetItem` with no error, which silently breaks tests.

Unit tests (mocking `ddb.send`) are optional but encouraged for pure business logic functions in `packages/shared/src/features/` and `packages/shared/src/auth/`.

### 9. Run tests

```bash
# For Lambda packages:
cd lambdas/{name} && npx vitest run

# For shared package:
cd packages/shared && npx vitest run

# For CDK:
cd infrastructure && npx cdk synth --strict --context env=dev 2>&1
```

Report pass/fail and test count. If tests fail: fix the issue, then re-run typecheck AND tests before continuing. Do not mark complete on a failing test suite.

### 10. Tick Done when items

For each `- [ ]` item in the spec's **Done when** checklist, verify it is satisfied (code exists, test passes, etc.). Edit the spec file — change `- [ ]` → `- [x]` for each completed criterion.

For infrastructure Done when items requiring CLI verification (e.g., "all 5 SSM outputs written"), add a human-verify note rather than checking the box automatically:
```
⚠️  "All 5 SSM outputs written" — verify with:
    aws ssm get-parameters-by-path --path /duseum/dev/stacks/storage/ --profile rmw-llc
```

### 11. Update spec Status

Only after ALL `Done when` boxes are checked:

Change `**Status**: ⬜ Pending` → `**Status**: ✅ Implemented`

Also update the design file: change `**Status**: ✅ Approved` → `**Status**: 🔒 Implemented`.

### 12. Summary

```
## Implementation Complete — {spec name}

FR coverage: {FR list}
Files created/modified: {list}
Done when: {n}/{n} criteria satisfied
TypeScript: PASS
Tests: PASS ({n} tests)
  FR-XXX-YY: {n} tests (happy path + {n} error paths)
  FR-XXX-ZZ: {n} tests (happy path + {n} error paths)

Next: run /spec-status to see overall project progress.
```

---

## Rules

- **Design gate is non-negotiable** — no `✅ Approved` design = no implementation
- **Prerequisite spec gate is non-negotiable** — prerequisite ⬜ Pending = hard stop
- **TypeScript compilation must pass before tests** — do not run vitest on type-broken code
- **Tests must be written (not just run) as part of implementation** — use the design's Integration Test Fixtures section. At minimum: one integration test per FR (happy path) plus one per error condition in Business logic.
- **Never mark `✅ Implemented` until ALL `Done when` boxes are checked**
- **Never mark `✅ Implemented` without at least one passing integration test per FR** — typecheck alone is not enough
- **Do not implement beyond what the design describes** — no extra abstractions, no scope creep
- **If implementation reveals the design needs a change** (new attribute, different signature): stop, update the design, ask for re-approval, then continue
- **Infrastructure `Done when` items that require CLI verification** are human-verifiable — note them but do not block completion on them
- **Every vitest.config.ts for a Lambda must have `fileParallelism: false`** — add it if missing before writing new test files
