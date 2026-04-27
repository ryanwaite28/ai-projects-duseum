#!/usr/bin/env bash
# =============================================================================
# scripts/smoke-test.sh — Post-deploy smoke tests (Section 9.6/9.7)
#
# Runs pytest smoke tests, prints a JSON results summary, uploads the results
# file to S3, then exits non-zero if any test failed.
#
# Never fails fast — all tests run regardless of individual failures.
#
# Usage (CI):    bash scripts/smoke-test.sh <dev|prod> <git-sha>
# Usage (local): bash scripts/smoke-test.sh <dev|prod>   (SHA defaults to timestamp)
#
# Requirements: python3, pip, aws CLI (credentials already configured)
#
# Results artifact:
#   s3://duseum-cicd-artifacts/{env}/smoke-tests/{sha}.results.json
# =============================================================================

# -e omitted intentionally: pytest exit code captured manually so all tests run
set -uo pipefail

ENV="${1:-}"
SHA="${2:-$(date -u +%Y%m%dT%H%M%SZ)}"

if [[ -z "$ENV" || ( "$ENV" != "dev" && "$ENV" != "prod" ) ]]; then
  echo "Usage: $0 <dev|prod> [git-sha]" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS_FILE="/tmp/smoke-${ENV}-${SHA}.results.json"
S3_KEY="${ENV}/smoke-tests/${SHA}.results.json"
BUCKET="duseum-cicd-artifacts"

# ── Install dependencies ───────────────────────────────────────────────────────
echo "=== Installing smoke test dependencies ==="
pip install --quiet -r "${SCRIPT_DIR}/smoke_tests/requirements.txt"

# ── Run tests ──────────────────────────────────────────────────────────────────
echo ""
echo "=== Running smoke tests (env=${ENV}  sha=${SHA}) ==="

PYTEST_EXIT=0
SMOKE_ENV="$ENV" pytest "${SCRIPT_DIR}/smoke_tests/" \
  --json-report \
  --json-report-file="$RESULTS_FILE" \
  --json-report-indent=2 \
  -v \
  --tb=short \
  || PYTEST_EXIT=$?

# ── Print JSON results ─────────────────────────────────────────────────────────
echo ""
echo "=== Results JSON ==="
if command -v jq &>/dev/null; then
  jq . "$RESULTS_FILE"
else
  cat "$RESULTS_FILE"
fi

# ── Upload to S3 ───────────────────────────────────────────────────────────────
echo ""
echo "=== Uploading results to S3 ==="
aws s3 cp "$RESULTS_FILE" "s3://${BUCKET}/${S3_KEY}"
echo "  s3://${BUCKET}/${S3_KEY}"

# ── Final verdict ──────────────────────────────────────────────────────────────
echo ""
if [[ "$PYTEST_EXIT" -eq 0 ]]; then
  echo "All smoke tests passed."
else
  echo "SMOKE TESTS FAILED — see results above and in S3" >&2
fi

exit "$PYTEST_EXIT"
