## Spec: Weekly Feature Booking (Paid)

**Status**: ✅ Implemented
**FR coverage**: FR-FEAT-08, FR-FEAT-09, FR-FEAT-10, FR-FEAT-11, FR-FEAT-12, FR-FEAT-13, FR-FEAT-14, FR-FEAT-16, FR-FEAT-17, FR-FEAT-18
**Relevant PROJECT.md sections**: 2.11, 4.2, 4.5, 4.7, 8

**What this implements**: Author books a weekly feature slot (paid, one-time); eligibility checks (3-month window, slot availability); Stripe Payment Intent; booking confirmation via webhook; Author booking history.

**Prerequisites**: `packages/shared/src/features/booking-eligibility.ts` created; SSM config params for `weekly_feature_fee_cents` and `weekly_feature_max_slots` seeded; Stripe secret in Secrets Manager; `subscriptions/webhook-processing.md` complete (handles `payment_intent.*` events); `features-lambda` deployed

**Done when**:
- [x] `checkBookingEligibility()` rejects Author with CONFIRMED booking in last 3 months → 409 (FR-FEAT-11)
- [x] Fully-booked week (slot count at max) rejects new booking → 409; `isoWeek` outside booking window → 400
- [x] `payment_intent.succeeded` for **current ISO week** → `featureStatus=ACTIVE`, `activatedAt` set (FR-FEAT-12, FR-FEAT-17)
- [x] `payment_intent.succeeded` for **future week** → `featureStatus=CONFIRMED` (awaits Monday rotation)
- [x] `payment_intent.payment_failed` → `featureStatus=CANCELLED, cancelledBy=STRIPE_PAYMENT_FAILED`
- [x] Booking calendar (`getEligibleWeeks`) excludes the current week on **Sundays (UTC)** — FR-FEAT-14
- [x] `GET /features/weekly/available` returns correct `available: boolean` per week based on current CONFIRMED+ACTIVE count vs config max; `slotsTotal` read from config (not hardcoded)
- [x] Frontend `WeeklyFeaturedCarousel` uses `data.slotsTotal` for slot count — never a hardcoded literal
- [x] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `lambdas/features/src/routes/book-weekly-feature.ts` — `POST /features/weekly/book`
- `lambdas/features/src/routes/get-weekly-featured.ts` — `GET /features/weekly` — current week's featured Authors
- `lambdas/features/src/routes/list-available-weeks.ts` — `GET /features/weekly/available` — weeks open for booking
- `lambdas/features/src/routes/get-author-booking-history.ts` — `GET /features/weekly/my-bookings`
- `packages/shared/src/features/booking-eligibility.ts` — `checkBookingEligibility()`, `getSlotCount()`

**DynamoDB access patterns used**:
- Booking record (primary): `PK=FEATURE#WEEK#{isoWeek}, SK=AUTHOR#{authorId}` — `featureStatus: 'PENDING'|'CONFIRMED'|'CANCELLED'`
- Booking record (Author key): `PK=AUTHOR#{authorId}, SK=FEATURE#WEEK#{isoWeek}`
- Slot count query: query `PK=FEATURE#WEEK#{isoWeek}` and count confirmed bookings
- 3-month window query: query `PK=AUTHOR#{authorId}, SK begins_with FEATURE#WEEK#` in date range

**Business logic**:
1. `GET /features/weekly/available` — returns eligible weeks with slot availability:
   - Eligible weeks computed by `getEligibleWeeks(advanceWeeks, now)` from `packages/shared/src/features/`
   - Sunday (UTC): current week excluded — `getEligibleWeeks` returns `startIndex=1` (FR-FEAT-14)
   - For each week: slot count (max from config table `WEEKLY_FEATURE_SLOT_COUNT`, default 3), confirmed+active bookings count, `available: boolean`
2. `POST /features/weekly/book` — body: `{ isoWeek }`:
   - Must be ACTIVE Author with `connectChargesEnabled=true`
   - Validate `isoWeek` is in the set returned by `getEligibleWeeks()` (FR-FEAT-14; implicitly blocks Sunday same-week booking)
   - `checkBookingEligibility()`: query Author's bookings in last 3 months → if any CONFIRMED or ACTIVE → 409 (FR-FEAT-11)
   - Check slot availability: `countActiveBookingsForWeek(isoWeek)` < maxSlots → if full → 409
   - Read weekly feature fee from config table (`WEEKLY_FEATURE_FEE_USD`)
   - Create Stripe Payment Intent (`amount=featureFee, currency=usd, metadata: { type:'WEEKLY_FEATURE', isoWeek, authorId, bookingId }`)
   - Write booking record with `featureStatus=PENDING`
   - Return: `{ paymentIntentClientSecret, bookingId }`
3. Webhook (`payment_intent.succeeded` with `metadata.type=WEEKLY_FEATURE`) — **branches on ISO week**:
   - If `shouldActivateImmediately(isoWeek)` (booking is for the current ISO week): set `featureStatus=ACTIVE`, `activatedAt=now` — Author appears on homepage immediately
   - If future week: set `featureStatus=CONFIRMED` — Author is promoted to ACTIVE by Monday rotation (FR-FEAT-15)
   - Both paths update the week-keyed and author-keyed records atomically
4. Webhook (`payment_intent.payment_failed`):
   - Set `featureStatus=CANCELLED`, `cancelledBy=STRIPE_PAYMENT_FAILED`, `cancelledAt=now`
5. `GET /features/weekly/my-bookings` — Author's upcoming + past bookings with payment receipt data
6. `GET /features/weekly` — homepage query uses `listBookingsByStatusAndWeek(ACTIVE, currentWeek)`. GSI deduplication: `FilterExpression: begins_with(PK, 'FEATURE#WEEK#')` prevents 2× returns from week-keyed and author-keyed records

**Error conditions**:
- Author already has CONFIRMED or ACTIVE booking within 3-month window → 409
- Week fully booked → 409
- `isoWeek` not in `getEligibleWeeks()` result (too far ahead, or Sunday same-week) → 400
- Author `connectChargesEnabled=false` → 400

**Tests to write**:
- Unit: `checkBookingEligibility()` date range logic; 8-week window calculation; slot count
- Integration: book → verify PENDING record + Payment Intent; webhook confirms → CONFIRMED; 3-month window blocks second booking
