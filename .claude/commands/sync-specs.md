# /sync-specs

Audit spec coverage against PROJECT.md functional requirements and ensure 100% FR coverage.

## Steps

1. **Extract all FR-* identifiers from PROJECT.md** by reading Sections 2.1–2.12:
   ```bash
   grep -oE 'FR-[A-Z]+-[0-9]+[a-z]?' PROJECT.md | sort -u
   ```

2. **Extract covered FRs from all spec files**:
   ```bash
   grep -rhoE 'FR-[A-Z]+-[0-9]+[a-z]?' specs/ | sort -u
   ```

3. **Build coverage map** — three categories:
   - ✅ **Covered**: FR identifier appears in at least one `specs/**/*.md` file
   - ❌ **Missing**: FR identifier exists in PROJECT.md but in no spec file
   - ⚠️ **Orphaned**: FR identifier appears in a spec file but not in PROJECT.md (may indicate a renamed or removed FR)

4. **Report results** in this format:
   ```
   ## Sync-Specs Audit — {date}

   ✅ Covered: {n} FRs
   ❌ Missing: {n} FRs  → will create stubs
   ⚠️ Orphaned: {n} FRs → review these

   ### Missing FRs (stubs to create):
   - FR-XXX-YY → suggested spec file: specs/{domain}/{file}.md

   ### Orphaned FRs (in specs but not in PROJECT.md):
   - FR-XXX-YY (found in specs/{file}.md)
   ```

5. **For each missing FR**: create a minimal stub spec file in the most appropriate domain directory:

   File naming convention: `specs/{domain}/{feature-name}.md`
   
   Domain mapping:
   - `FR-AUTH-*` → `specs/auth/`
   - `FR-PROF-*` → `specs/users/`
   - `FR-VIEW-*` → `specs/users/` (viewer features)
   - `FR-AUTH-PROF-*` → `specs/users/`
   - `FR-ART-*` → `specs/artworks/`
   - `FR-COL-*` → `specs/artworks/`
   - `FR-SUB-*` → `specs/subscriptions/`
   - `FR-DISC-*` → `specs/discovery/`
   - `FR-SOC-*` → `specs/social/`
   - `FR-ADMIN-*` → `specs/admin/`
   - `FR-FEAT-*` → `specs/features/`
   - `FR-NOTIF-*` → `specs/notifications/`

   Stub format:
   ```markdown
   ## Spec: {Descriptive Name}

   **Status**: ⬜ Pending
   **FR coverage**: {FR-XXX-YY}
   **Relevant PROJECT.md sections**: {section number}
   **What this implements**: TODO — read PROJECT.md section and fill in.

   **Prerequisites**: TODO — list what must exist (deployed infra, prior specs, shared functions, seeded secrets) before starting this spec.

   **Done when**:
   - [ ] TODO — verifiable criterion 1
   - [ ] TODO — verifiable criterion 2
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

6. **Update specs/README.md** — add any new spec files to the appropriate table section; verify FR coverage counts are accurate.

7. **Final summary**: print total FR count from PROJECT.md vs covered count.

## Usage

Run `/sync-specs` at the start of any new implementation session to verify the spec index is current and complete before picking up work.

Run it after adding new FRs to PROJECT.md — it will detect uncovered FRs and create stubs automatically.

## Notes

- Specs are documentation of intent + constraints, not implementation. Do not modify existing spec `**Status**` fields automatically — only the human (or implementer) updates status after completing work.
- If an orphaned FR is found, investigate whether PROJECT.md was updated (FR removed/renamed) or whether the spec file has a typo. Do not auto-delete orphaned entries — flag them for review.
- The `/sync-specs` skill reads PROJECT.md directly — it is the authoritative source. Spec files are downstream.
