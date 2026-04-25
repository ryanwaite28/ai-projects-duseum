## Spec: CI/CD Pipeline (GitHub Actions + OIDC)

**Status**: ✅ Implemented
**FR coverage**: NFR-REL-01 (deployment reliability)
**Relevant PROJECT.md sections**: 9, 11, 13.5

**What this implements**: GitHub Actions workflows for CI (typecheck, lint, test on PR), CDK deploy (dev on merge to main, prod on tag push); OIDC-based AWS authentication (no static keys); Turborepo-based monorepo build.

**Prerequisites**: OIDC identity provider + `duseum-github-actions-deploy-{env}` IAM roles provisioned (Phase 0.3); all CDK stacks code-complete; `cdk synth --strict` passes locally

**Done when**:
- [x] `ci.yml` runs typecheck, lint, and tests on every PR; blocks merge on failure
- [x] `deploy-dev.yml` triggers CDK deploy to dev on push to `main`
- [x] `deploy-prod.yml` triggers CDK deploy to prod on `v*.*.*` tag push
- [x] `cdk synth --strict --context env={env}` step in all deploy workflows (zero-warning gate)
- [x] No static AWS keys in GitHub secrets — OIDC `id-token: write` only
- [x] CDK bootstrap runs sequentially (dev then prod — never simultaneous in shared account `408141212087`)
- [x] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `.github/workflows/ci.yml` — PR checks: typecheck + lint + test all packages
- `.github/workflows/deploy-dev.yml` — on push to main: CDK deploy to dev
- `.github/workflows/deploy-prod.yml` — on tag `v*.*.*`: CDK deploy to prod
- `.github/workflows/bootstrap.yml` — one-time CDK bootstrap (manual trigger)

**GitHub Actions OIDC**:
- Role: `duseum-github-actions-deploy-{env}` (pre-provisioned IAM role; do NOT recreate in CDK)
- Trust policy: `token.actions.githubusercontent.com` + repo + branch/tag condition
- Permissions: `id-token: write`, `contents: read`

**Workflow jobs** (deploy):
1. `lint-typecheck` — `turbo run typecheck lint`
2. `test` — `turbo run test` (vitest; requires MiniStack — skip in CI or use testcontainers)
3. `build` — `turbo run build:lambdas`
4. `cdk-synth` — `cdk synth --strict --context env={env}` — must pass zero warnings
5. `cdk-deploy` — `cdk deploy --all --context env={env} --require-approval never`

**CDK bootstrap**:
- Bootstrap runs separately for dev then prod (not simultaneous — same AWS account `408141212087`)
- `cdk bootstrap --trust {accountId} --cloudformation-execution-policies ...`

**Branch/tag strategy**:
- `main` → deploys to dev
- `v*.*.*` tag → deploys to prod (requires passing `main` CI first)
- Feature branches → CI only (no deploy)

**Tests to write**:
- Workflow syntax validation (GitHub Actions schema)
- CDK synth in CI must pass with `--strict` (zero warnings)
