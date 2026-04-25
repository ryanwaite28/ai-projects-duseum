## Design: CI/CD Pipeline (GitHub Actions)

**Spec**: `specs/infrastructure/cicd.md`
**Status**: 🔒 Implemented
**Approved**: 2026-04-25
**Last updated**: 2026-04-25

---

### TypeScript Interfaces

N/A — CI/CD pipeline; no TypeScript interfaces.

### DynamoDB Record Shapes

N/A — pipeline configuration only; no DynamoDB records.

### Function Signatures

N/A — GitHub Actions YAML workflows; no Lambda functions.

### CDK Construct Patterns

N/A — not a CDK stack. See workflow files in `.github/workflows/`.

### Workflow Inventory

| File | Trigger | Purpose |
|---|---|---|
| `ci.yml` | PR to `develop`/`main`; `workflow_call` | Gate: typecheck, lint, unit-test, integration-test, cdk-synth (dev+prod) |
| `deploy-dev.yml` | Push to `develop` branch; `workflow_dispatch` | ci → build → deploy (dev) → smoke-test |
| `deploy-prod.yml` | Push of `v*.*.*` tag; `workflow_dispatch` | ci → build → deploy (prod, manual approval gate) → smoke-test |
| `_build-lambdas.yml` | `workflow_call` (reusable) | Bundle all 11 Lambdas with esbuild → upload ZIPs to S3 artifact bucket |
| `_cdk-deploy.yml` | `workflow_call` (reusable) | `cdk deploy --all` for a given environment via OIDC |

### Implementation Steps

#### `ci.yml` — 5 parallel jobs

1. **typecheck** — `npm run typecheck` across all workspaces (Node 20, `npm ci`).
2. **lint** — `npm run lint` across all workspaces.
3. **unit-test** — `npx turbo run test --filter='./packages/**' --filter='./frontend'` — runs `packages/shared` and `frontend` tests only; no external services required.
4. **integration-test** — `npx turbo run test --filter='./lambdas/**'` — runs all lambda test suites with MiniStack service container (`nahuelnucera/ministack:latest`) on port 4566; env: `AWS_ENDPOINT_URL=http://localhost:4566`, `AWS_REGION=us-east-1`, fake `AWS_ACCESS_KEY_ID=test` / `AWS_SECRET_ACCESS_KEY=test`. Health check polls `/_ministack/health` (up to 12 retries × 5s).
5. **cdk-synth-dev** + **cdk-synth-prod** — `cd infrastructure && npx cdk synth --strict --context env={env}` for both environments (separate jobs). No AWS credentials required — synth is local.

Permissions: `contents: read` only (no OIDC needed for CI).

#### `_build-lambdas.yml` — reusable Lambda build

Triggered via `workflow_call` with `sha` input. Lambda names bundled: `admin artworks auth-triggers features maintenance media notifications social subscriptions subscriptions-webhook users`.

For each Lambda:
- `npx esbuild lambdas/{name}/src/index.ts --bundle --minify --platform=node --target=node20 --external:@aws-sdk/* --outfile=dist/lambdas/{name}/index.js`
- `zip -j dist/lambdas/{name}/function.zip dist/lambdas/{name}/index.js`

ZIPs uploaded to `s3://duseum-dev-lambda-artifacts/{sha}/{name}/function.zip` (single shared artifact bucket for both environments). Uses `AWS_ROLE_ARN_BUILD` secret (deploy-dev role has `s3:PutObject` on artifact bucket).

#### `_cdk-deploy.yml` — reusable CDK deploy

Triggered via `workflow_call` with `environment` and `sha` inputs. Assumes `AWS_ROLE_ARN` via OIDC (`id-token: write` permission). Runs:
```
npx cdk deploy --all \
  --context env={environment} \
  --context sha={sha} \
  --require-approval never \
  --outputs-file cdk-outputs.json
```
`environment: ${{ inputs.environment }}` on the job maps to a GitHub Environment, enabling protection rules (manual approval for `prod`).

#### `deploy-dev.yml` — dev deployment pipeline

Trigger: push to `develop` branch (NOT `main`). Job chain: `ci` → `build` → `deploy` → `smoke-test`.
- `build` calls `_build-lambdas.yml` with `AWS_ROLE_ARN_BUILD: ${{ secrets.AWS_ROLE_ARN_DEPLOY_DEV }}`.
- `deploy` calls `_cdk-deploy.yml` with `environment: dev`, `AWS_ROLE_ARN: ${{ secrets.AWS_ROLE_ARN_DEPLOY_DEV }}`.
- `smoke-test`: assumes `AWS_ROLE_ARN_DEPLOY_DEV` via OIDC, runs `bash scripts/smoke-test.sh dev`.

#### `deploy-prod.yml` — prod deployment pipeline

Trigger: push of `v*.*.*` tag. Job chain: `ci` → `build` → `deploy-prod` → `smoke-test`.
- `build` uses dev role (`AWS_ROLE_ARN_DEPLOY_DEV`) — artifact bucket is in dev account.
- `deploy-prod` calls `_cdk-deploy.yml` with `environment: prod`, `AWS_ROLE_ARN: ${{ secrets.AWS_ROLE_ARN_DEPLOY_PROD }}`; the `prod` GitHub Environment enforces manual approval before this job runs.
- `smoke-test`: assumes `AWS_ROLE_ARN_DEPLOY_PROD` via OIDC, runs `bash scripts/smoke-test.sh prod`.

### Integration Test Fixtures

The CI pipeline itself validates integration tests on every PR via the `integration-test` job (MiniStack service container). No separate pipeline tests.

### Decisions & Constraints

- **OIDC — no static AWS keys**: all deploy jobs use `aws-actions/configure-aws-credentials@v4` with `role-to-assume` (OIDC). Roles: `duseum-github-actions-deploy-dev` and `duseum-github-actions-deploy-prod`. IAM role trust policy binds to the specific GitHub repo + branch/tag ref. `id-token: write` permission is required on any job that assumes an AWS role.
- **deploy-dev triggers on `develop` branch, not `main`**: `main` is the production gate (tagged releases only). Commits to `develop` → auto-deploy to dev. `main` branch only advances via PRs from `develop`; prod deploys only on `v*.*.*` tags.
- **Lambda artifact bucket is shared**: `duseum-dev-lambda-artifacts` is a single S3 bucket used by both dev and prod builds. ZIPs are keyed by `{sha}/{name}/function.zip`. The dev role has `s3:PutObject` on this bucket and is used for both dev and prod builds — the artifact bucket is not environment-sensitive.
- **MiniStack (nahuelnucera/ministack) — not LocalStack**: integration tests use `nahuelnucera/ministack:latest` Docker image at `localhost:4566`. Health check endpoint is `/_ministack/health`. Standard `aws` CLI / SDK with `AWS_ENDPOINT_URL=http://localhost:4566` (not `awslocal` wrapper).
- **`cdk synth --strict`**: both `cdk-synth-dev` and `cdk-synth-prod` run with `--strict` flag — CDK warnings are treated as errors. No AWS credentials needed for synth; context values (`certArn`, `cloudfrontKeyPairId`) must be present in `cdk.json` or CI will fail.
- **Manual approval gate on prod**: the `prod` GitHub Environment (configured in repo Settings → Environments) requires manual reviewer approval before the `deploy-prod` job runs. This prevents accidental production deploys from `workflow_dispatch`.
- **esbuild bundling**: each Lambda is bundled into a single `index.js` with `--minify` and `--external:@aws-sdk/*` (AWS SDK v3 is provided by the Lambda runtime). The stripe-ingress Lambda (`lambdas/subscriptions-webhook/src/ingress.ts`) is bundled as part of the `subscriptions-webhook` Lambda workspace from `index.ts` (the esbuild step does not separately bundle `ingress.ts`).
- **`--require-approval never`** on `cdk deploy`: approval gates are handled at the GitHub Environment level (manual approval for prod), not at CDK level. CDK's interactive approval prompt would hang a CI job.
- **No bootstrap per-deploy**: CDK bootstrap is a one-time operation per account/region. The pipeline assumes `408141212087/us-east-1` has already been bootstrapped. Bootstrap is not in these workflows.
- **Turborepo task filtering**: `--filter='./packages/**' --filter='./frontend'` for unit tests; `--filter='./lambdas/**'` for integration tests. This separation means unit tests never start MiniStack, keeping the unit-test job fast.
