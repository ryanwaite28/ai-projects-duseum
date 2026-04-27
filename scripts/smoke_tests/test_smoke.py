"""
Post-deploy smoke tests for Duseum.

Invoked via scripts/smoke-test.sh. Requires SMOKE_ENV=dev|prod in the environment.
All test classes run independently — a failure in one class does not skip others.
"""

import os

import boto3
import pytest
import requests

# ── Configuration ──────────────────────────────────────────────────────────────

ENV    = os.environ.get("SMOKE_ENV", "dev")
REGION = "us-east-1"

if ENV == "prod":
    API_BASE   = "https://api.duseum.com"
    APP_DOMAIN = "duseum.com"
else:
    API_BASE   = f"https://api.{ENV}.duseum.com"
    APP_DOMAIN = f"{ENV}.duseum.com"


# ── HTTP helper ────────────────────────────────────────────────────────────────

def get_status(path: str) -> int:
    """Return HTTP status code for a GET request, or 0 on connection failure."""
    try:
        r = requests.get(f"{API_BASE}{path}", timeout=15, allow_redirects=True)
        return r.status_code
    except requests.RequestException:
        return 0


# ══════════════════════════════════════════════════════════════════════════════
# API endpoint checks
# ══════════════════════════════════════════════════════════════════════════════

class TestApiEndpoints:
    """Public and guarded API routes return expected status codes."""

    def test_features_daily_is_reachable(self):
        code = get_status("/features/daily")
        assert 200 <= code < 300, f"GET /features/daily → {code} (expected 2xx)"

    def test_features_weekly_is_reachable(self):
        code = get_status("/features/weekly")
        assert 200 <= code < 300, f"GET /features/weekly → {code} (expected 2xx)"

    def test_features_weekly_availability_is_reachable(self):
        code = get_status("/features/weekly/availability")
        assert 200 <= code < 300, f"GET /features/weekly/availability → {code} (expected 2xx)"

    def test_users_me_rejects_unauthenticated(self):
        code = get_status("/users/me")
        assert code != 0,                        "GET /users/me → no response (connection failure)"
        assert not (500 <= code < 600),          f"GET /users/me (no auth) → {code} (expected non-5xx)"

    def test_artworks_rejects_unauthenticated(self):
        code = get_status("/artworks")
        assert code != 0,                        "GET /artworks → no response (connection failure)"
        assert not (500 <= code < 600),          f"GET /artworks (no auth) → {code} (expected non-5xx)"


# ══════════════════════════════════════════════════════════════════════════════
# DynamoDB table checks
# ══════════════════════════════════════════════════════════════════════════════

class TestDynamoDB:
    """All DynamoDB tables are in ACTIVE state."""

    @pytest.fixture(scope="class")
    def ddb(self):
        return boto3.client("dynamodb", region_name=REGION)

    @pytest.mark.parametrize("suffix", ["main", "idempotency", "config"])
    def test_table_is_active(self, ddb, suffix):
        table = f"duseum-{ENV}-dynamodb-{suffix}"
        resp  = ddb.describe_table(TableName=table)
        state = resp["Table"]["TableStatus"]
        assert state == "ACTIVE", f"Table {table} is {state!r} (expected ACTIVE)"


# ══════════════════════════════════════════════════════════════════════════════
# CloudFront distribution checks
# ══════════════════════════════════════════════════════════════════════════════

class TestCloudFront:
    """CloudFront distributions with the expected domain aliases exist."""

    @pytest.fixture(scope="class")
    def aliases(self):
        cf    = boto3.client("cloudfront", region_name=REGION)
        items = cf.list_distributions().get("DistributionList", {}).get("Items", [])
        return {
            alias
            for dist in items
            for alias in (dist.get("Aliases", {}).get("Items") or [])
        }

    def test_app_distribution_exists(self, aliases):
        assert APP_DOMAIN in aliases, \
            f"No CloudFront distribution found with alias '{APP_DOMAIN}'"

    def test_media_distribution_exists(self, aliases):
        media = f"media.{APP_DOMAIN}"
        assert media in aliases, \
            f"No CloudFront distribution found with alias '{media}'"
