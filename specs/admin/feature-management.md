## Spec: Admin Feature & Booking Management

**Status**: ✅ Implemented
**FR coverage**: FR-ADMIN-06, FR-ADMIN-07, FR-FEAT-06
**Relevant PROJECT.md sections**: 2.10, 2.11, 4.2, 8

**What this implements**: Admin dashboard data (users, subscriptions, MRR, signups, flagged content, feature bookings); Admin cancel weekly feature booking with Stripe refund.

**Prerequisites**: `features/weekly-booking.md` complete; Stripe secret key in Secrets Manager; Admin middleware in place; `admin-lambda` deployed

**Done when**:
- [x] Admin cancel: Stripe `refunds.create()` called BEFORE DynamoDB `featureStatus=CANCELLED` update; if Stripe fails, DynamoDB NOT updated
- [x] Cancel non-CONFIRMED booking (PENDING or already CANCELLED) → 400; booking not found → 404
- [x] `GET /admin/dashboard` returns all 7 aggregate metrics (totalUsers, platformSubs, authorSubs, MRR, signups 7d/30d, weeklyFeatureRevenue)
- [x] Slot count decrements after admin cancel (week becomes bookable again)
- [x] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `lambdas/admin/src/routes/get-dashboard.ts` — `GET /admin/dashboard`
- `lambdas/admin/src/routes/cancel-weekly-booking.ts` — `DELETE /admin/features/weekly/{isoWeek}/authors/{authorId}`
- `lambdas/admin/src/routes/list-weekly-bookings.ts` — `GET /admin/features/weekly` — all upcoming bookings by week

**DynamoDB access patterns used**:
- Booking records by week: `PK=FEATURE#WEEK#{isoWeek}` — query all SK
- All user count: DynamoDB `COUNT` query on PROFILE#VIEWER records or config counter
- Active subscriptions: aggregate query on SUB# records (or cached counters)
- Weekly feature revenue: aggregate CONFIRMED bookings × fee amount

**Business logic**:
1. `GET /admin/dashboard` — aggregate read (cached, stale-ok up to 5 minutes):
   - Total users (Viewer profile count)
   - Active Platform subscriptions count
   - Active Author subscriptions count (total across all Authors)
   - MRR estimate (sum of active subscription amounts)
   - New signups in last 7 days and 30 days
   - Upcoming weekly feature bookings by week (next 8 weeks)
   - Weekly feature revenue (current month)
2. `DELETE /admin/features/weekly/{isoWeek}/authors/{authorId}`:
   - Lookup booking: `PK=FEATURE#WEEK#{isoWeek}, SK=AUTHOR#{authorId}`
   - Must be CONFIRMED (cannot cancel PENDING or already CANCELLED)
   - Retrieve Stripe Payment Intent ID from booking record
   - Issue Stripe full refund (`refunds.create({ payment_intent: piId })`)
   - Set booking `featureStatus=CANCELLED`, `cancelledBy=ADMIN`, `cancelledByAdminId`, `refundedAt`
   - Slot becomes available for re-booking
   - Log cancellation with timestamp + admin userId

**Error conditions**:
- Booking not found → 404
- Booking not CONFIRMED → 400
- Stripe refund failure → 500 (do not set DynamoDB to CANCELLED if Stripe failed — consistency)

**Tests to write**:
- Unit: refund-before-DynamoDB-update ordering (consistency rule)
- Integration: seed CONFIRMED booking, admin cancel → verify Stripe refund called + booking CANCELLED; slot count decrements (becomes available)
