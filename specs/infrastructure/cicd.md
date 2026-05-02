## Spec: CI/CD Pipeline (GitHub Actions + OIDC)

**Status**: ✅ Implemented
**FR coverage**: NFR-REL-01 (deployment reliability)
**Relevant PROJECT.md sections**: 9, 9.8, 11, 13.5

**What this implements**: GitHub Actions workflows for CI (typecheck, lint, test on PR), CDK deploy (dev on merge to develop, prod on tag push); OIDC-based AWS authentication (no static keys); Turborepo-based monorepo build; shift-left bootstrap prerequisites check (parallel with Build); post-deploy runtime dependency check gating smoke tests.

**Prerequisites**: OIDC identity provider + `duseum-github-actions-deploy-{env}` IAM roles provisioned (via `scripts/bootstrap.sh` §6); all CDK stacks code-complete; `cdk synth --strict` passes locally; `scripts/bootstrap.sh` run with all Stripe secrets seeded

**Pipeline shape** (both dev and prod):
```
CI → [Build ∥ Bootstrap Check] → Deploy (CDK) → Deploy Frontend → Dep Check → Smoke Test
```

**Done when**:
- [x] `ci.yml` runs typecheck, lint, and tests on every PR; blocks merge on failure
- [x] `deploy-dev.yml` triggers CDK deploy to dev on push to `develop`
- [x] `deploy-prod.yml` triggers CDK deploy to prod on `v*.*.*` tag push
- [x] `cdk synth --strict --context env={env}` step in all deploy workflows (zero-warning gate)
- [x] No static AWS keys in GitHub secrets — OIDC `id-token: write` only
- [x] CDK bootstrap runs sequentially (dev then prod — never simultaneous in shared account `408141212087`)
- [x] `_pre-deploy-check.yml` runs in parallel with Build; Deploy gates on both; fails fast if bootstrap.sh outputs are missing
- [x] `_dep-check.yml` runs after Deploy Frontend; Smoke Test gates on dep-check; smart failure distinguishes table-missing from key-missing from placeholder value
- [x] Both `_pre-deploy-check.yml` and `_dep-check.yml` accept `environment` as an input (never hardcoded inside)
- [x] Both reusable workflows declare `environment: ${{ inputs.environment }}` and `permissions: id-token: write` on the job (OIDC sub claim requirement)
- [x] `scripts/pre-deploy-check.sh` verifies S3, 7 Secrets Manager secrets, 2 SSM params, 2 IAM roles
- [x] `scripts/dep-check.sh` verifies 6 config table keys (smart logic), 7 secrets existence, Stripe price active status
- [x] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `.github/workflows/ci.yml` — PR checks: typecheck + lint + test all packages
- `.github/workflows/deploy-dev.yml` — on push to `develop`: CI → [Build ∥ Bootstrap Check] → Deploy → Deploy Frontend → Dep Check → Smoke Test
- `.github/workflows/deploy-prod.yml` — on tag `v*.*.*`: same pipeline + manual approval gate at Deploy
- `.github/workflows/_build-lambdas.yml` — reusable: build Lambda ZIPs, upload to S3
- `.github/workflows/_cdk-deploy.yml` — reusable: CDK deploy all stacks for a given environment
- `.github/workflows/_pre-deploy-check.yml` — reusable: bootstrap prerequisites check (new)
- `.github/workflows/_dep-check.yml` — reusable: runtime dependency check (new)
- `.github/workflows/_deploy-frontend.yml` — reusable: build + deploy SPA to S3 + CloudFront
- `scripts/pre-deploy-check.sh` — bootstrap prerequisites verification (new)
- `scripts/dep-check.sh` — runtime data verification with smart failure logic (new)

**GitHub Actions OIDC**:
- Role: `duseum-github-actions-deploy-{env}` (pre-provisioned by `bootstrap.sh` §6)
- Trust policy: `token.actions.githubusercontent.com` + repo + `environment:{env}` condition
- Permissions: `id-token: write`, `contents: read`
- **Every job that calls `configure-aws-credentials` must declare `environment:` matching the role trust policy**

**Workflow jobs** (deploy — in dependency order):
1. `ci` — calls `ci.yml`; gates everything
2. `build` — needs `[ci]`; builds Lambda ZIPs, uploads to `duseum-cicd-artifacts`
3. `pre-deploy-check` — needs `[ci]`; runs in **parallel** with `build`; verifies bootstrap prerequisites
4. `deploy` — needs `[build, pre-deploy-check]`; CDK deploy all stacks
5. `deploy-frontend` — needs `[deploy]`; build + deploy SPA
6. `dep-check` — needs `[deploy-frontend]`; verifies runtime data seeded and correct
7. `smoke-test` — needs `[dep-check]`; end-to-end API health checks

**Bootstrap Check — what it verifies** (bootstrap.sh outputs, not CDK resources):
- S3: `duseum-cicd-artifacts` bucket (head-bucket)
- Secrets Manager: `duseum/{env}/stripe/secret-key`, `webhook-secret`, `webhook-secret-account`, `connect-client-id`, `duseum/{env}/cloudfront/private-key`, `duseum/{env}/notifications/unsubscribe-secret`, `duseum/{env}/ses/from-address` (7 secrets)
- SSM: `/duseum/{env}/cloudfront/key_pair_id`, `/duseum/{env}/stripe/platform_price_id`
- IAM: `duseum-github-actions-deploy-{env}`, `duseum-github-actions-build`

**Dep Check — smart failure logic**:
1. `describe-table duseum-{env}-dynamodb-config` → `ResourceNotFoundException` → CDK deploy failed
2. Per-key `get-item` → key absent → bootstrap.sh §3.6 not run
3. Key present, value starts with `REPLACE_WITH_` → bootstrap.sh §3.7 incomplete
4. `PLATFORM_SUB_PRICE_ID` value → Stripe GET `/v1/prices/{id}` → status must be `active`

**CDK bootstrap**:
- Bootstrap runs separately for dev then prod (not simultaneous — same AWS account `408141212087`)
- Run `bootstrap.sh` before `cdk bootstrap` — bootstrap.sh provisions the IAM roles that CDK bootstrap trusts

**Branch/tag strategy**:
- `develop` → deploys to dev
- `v*.*.*` tag → deploys to prod (requires passing CI first; manual approval gate at Deploy)
- Feature branches → CI only (no deploy)

**Keeping pre-deploy-check in sync with bootstrap.sh**:
When `bootstrap.sh` adds a new provisioned resource:
1. Add the corresponding check to `scripts/pre-deploy-check.sh`
2. If it is a runtime data key, also add it to `scripts/dep-check.sh` `REQUIRED_KEYS`

**Tests to write**:
- Workflow syntax validation (GitHub Actions schema)
- CDK synth in CI must pass with `--strict` (zero warnings)
- `scripts/pre-deploy-check.sh` — manual run after bootstrap to confirm all prerequisites pass before first CI/CD run
- `scripts/dep-check.sh` — manual run after first CDK deploy to confirm runtime data is seeded
