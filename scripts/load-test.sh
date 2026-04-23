#!/usr/bin/env bash
# =============================================================================
# scripts/load-test.sh — k6 load test for Duseum API
#
# Validates NFR-PERF-01 (P95 < 2s) and NFR-PERF-04 (read P95 < 500ms).
# NFR-PERF-03 (Lambda cold start < 1s) is measured post-test via CloudWatch.
#
# Usage:
#   API_BASE=https://api.dev.duseum.com  bash scripts/load-test.sh
#   API_BASE=https://api.duseum.com      bash scripts/load-test.sh
#
# Requires: k6 binary on PATH (brew install k6)
# Exit code: 0 = all thresholds met, 1 = one or more violations
# =============================================================================

set -euo pipefail

API_BASE="${API_BASE:-}"
if [[ -z "$API_BASE" ]]; then
  echo "ERROR: API_BASE env var is required." >&2
  echo "  Example: API_BASE=https://api.dev.duseum.com bash scripts/load-test.sh" >&2
  exit 1
fi

if ! command -v k6 &>/dev/null; then
  echo "ERROR: k6 is not installed." >&2
  echo "  macOS:  brew install k6" >&2
  echo "  Linux:  https://k6.io/docs/get-started/installation/" >&2
  exit 1
fi

echo ""
echo "=== Duseum API Load Test ==="
echo "  Target  : $API_BASE"
echo "  VUs     : 100 (5-minute ramp: 1m up → 3m sustained → 1m down)"
echo "  NFR     : P95 < 2000ms (PERF-01), read P95 < 500ms (PERF-04)"
echo ""

# Write the k6 script to a temp file so this remains a single bash script.
K6_SCRIPT=$(mktemp /tmp/duseum-load-test-XXXXXX.js)
trap 'rm -f "$K6_SCRIPT"' EXIT

cat > "$K6_SCRIPT" <<'SCRIPT'
import http    from 'k6/http'
import { check, sleep } from 'k6'
import { Trend, Rate } from 'k6/metrics'

// ── Custom metrics ────────────────────────────────────────────────────────────

const artworkListDuration   = new Trend('artwork_list_duration',   true)
const artworkDetailDuration = new Trend('artwork_detail_duration', true)
const dailyDuration         = new Trend('daily_duration',          true)
const errorRate             = new Rate('error_rate')

// ── Load shape ────────────────────────────────────────────────────────────────
//
//  Stage 1: 1 min  — ramp 0 → 100 VUs
//  Stage 2: 3 min  — hold 100 VUs (steady state)
//  Stage 3: 1 min  — ramp 100 → 0 VUs
//

export const options = {
  stages: [
    { duration: '1m', target: 100 },
    { duration: '3m', target: 100 },
    { duration: '1m', target: 0   },
  ],
  thresholds: {
    // NFR-PERF-01: public gallery pages P95 < 2s
    'http_req_duration{p(95)}': ['p(95)<2000'],

    // NFR-PERF-04: read endpoints P95 < 500ms
    'artwork_list_duration{p(95)}':   ['p(95)<500'],
    'artwork_detail_duration{p(95)}': ['p(95)<500'],
    'daily_duration{p(95)}':          ['p(95)<500'],

    // Error rate < 1%
    'error_rate': ['rate<0.01'],

    // Absolute ceiling — catch runaway cold starts visible to clients
    'http_req_duration{p(100)}': ['p(100)<10000'],
  },
}

// ── VU scenario ───────────────────────────────────────────────────────────────

export default function () {
  const base    = __ENV.API_BASE
  const headers = { 'Accept': 'application/json' }

  // 1 — GET /artworks (list)
  const listRes = http.get(`${base}/artworks?limit=20`, { headers, tags: { name: 'list_artworks' } })
  artworkListDuration.add(listRes.timings.duration)
  const listOk = check(listRes, {
    'GET /artworks → 200': (r) => r.status === 200,
  })
  errorRate.add(!listOk)

  // Extract a real artworkId from the response for the detail call
  let artworkId = null
  if (listOk) {
    try {
      const body = JSON.parse(listRes.body)
      if (body.items && body.items.length > 0) {
        artworkId = body.items[0].artworkId
      }
    } catch (_) {}
  }

  // 2 — GET /artworks/{id} (detail) — only if we got a valid ID
  if (artworkId) {
    const detailRes = http.get(`${base}/artworks/${artworkId}`, { headers, tags: { name: 'get_artwork' } })
    artworkDetailDuration.add(detailRes.timings.duration)
    const detailOk = check(detailRes, {
      'GET /artworks/:id → 200': (r) => r.status === 200,
    })
    errorRate.add(!detailOk)
  }

  // 3 — GET /features/daily
  const dailyRes = http.get(`${base}/features/daily`, { headers, tags: { name: 'daily_feature' } })
  dailyDuration.add(dailyRes.timings.duration)
  const dailyOk = check(dailyRes, {
    'GET /features/daily → 200': (r) => r.status === 200,
  })
  errorRate.add(!dailyOk)

  sleep(1)
}
SCRIPT

# Run k6, passing API_BASE as an env var
k6 run \
  --env API_BASE="$API_BASE" \
  --summary-trend-stats="avg,min,med,max,p(90),p(95),p(99)" \
  "$K6_SCRIPT"

EXIT_CODE=$?

echo ""
echo "=== NFR-PERF-03: Lambda Cold Start Verification ==="
echo ""
echo "Cold start latency (< 1s per NFR-PERF-03) cannot be observed from the client"
echo "because API Gateway connection overhead is included. Measure via CloudWatch:"
echo ""
echo "  Run this Logs Insights query in the AWS Console (region: us-east-1):"
echo "  Log group filter: /aws/lambda/duseum-*"
echo ""
cat <<'QUERY'
  fields @timestamp, @logStream, @message
  | filter @message like /Init Duration/
  | parse @message "Init Duration: * ms" as initMs
  | stats
      count()          as coldStarts,
      avg(initMs)      as avgInitMs,
      max(initMs)      as maxInitMs,
      pct(initMs, 95)  as p95InitMs
  | sort @timestamp desc
  | limit 100
QUERY
echo ""
echo "  Expected: p95InitMs < 1000"
echo "  If cold starts exceed 1s → consider provisioned concurrency on artworks-lambda"
echo "  and features-lambda (critical read paths)."
echo ""

exit $EXIT_CODE
