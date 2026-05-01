## Spec: Platform Configuration (Admin)

**Status**: ✅ Implemented
**FR coverage**: FR-ADMIN-05, FR-SUB-01, FR-SUB-10
**Relevant PROJECT.md sections**: 2.10, 5.4, 8

**What this implements**: Admin-controlled platform settings stored in SSM Parameter Store — free-tier piece limit, platform subscription price ID, revenue cut percentage, weekly feature fee and slot count.

**Prerequisites**: All 5 SSM config params seeded (Phase 0.4); Admin middleware in place; `admin-lambda` deployed with SSM read/write IAM permissions

**Done when**:
- [x] `GET /admin/config` reads all 6 config values in parallel from DynamoDB config table and returns them
- [x] `PUT /admin/config` writes changed values; validation rejects out-of-range values (e.g., cut% > 100 → 400)
- [x] Config change takes effect on next Lambda invocation without redeploy (DynamoDB read at request time)
- [x] Non-Admin → 403 (enforced by `requireAdminMiddleware` on all admin-lambda routes)
- [x] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `lambdas/admin/src/routes/get-config.ts` — `GET /admin/config`
- `lambdas/admin/src/routes/update-config.ts` — `PUT /admin/config`
- `packages/shared/src/config/platform-config.ts` — `getPlatformConfig()` — reads SSM params; `updatePlatformConfig()` — writes SSM params

**SSM Parameter paths** (`/duseum/{env}/config/`):
| Key | Type | Default |
|---|---|---|
| `free_tier_piece_limit` | Integer | 10 |
| `platform_subscription_price_id` | String | Stripe price ID |
| `author_revenue_cut_percent` | Integer | 20 |
| `weekly_feature_fee_cents` | Integer | 2500 |
| `weekly_feature_max_slots` | Integer | 10 |

**Business logic**:
1. `GET /admin/config` — read all 5 SSM params in parallel (`SSM.getParameters()`)
2. `PUT /admin/config` — body: partial update of above fields:
   - `free_tier_piece_limit`: integer 1–100
   - `author_revenue_cut_percent`: integer 0–50
   - `weekly_feature_fee_cents`: integer ≥ 100
   - `weekly_feature_max_slots`: integer 1–20
   - Write changed params to SSM via `SSM.putParameter({ Overwrite: true })`
3. Config changes take effect immediately on next Lambda invocation (SSM reads are at request time, not startup); no code deploy needed

**Error conditions**:
- `author_revenue_cut_percent` > 50 → 400
- `weekly_feature_max_slots` > 20 → 400
- SSM write failure → 500

**Tests to write**:
- Unit: validation boundaries for each config field
- Integration: update `free_tier_piece_limit` → read back from SSM confirms new value; access control test — non-Admin rejected
