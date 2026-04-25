## Spec: Weekly Feature Booking (Paid)

**Status**: ⬜ Pending
**FR coverage**: FR-FEAT-08, FR-FEAT-09, FR-FEAT-10, FR-FEAT-11, FR-FEAT-12, FR-FEAT-13, FR-FEAT-14, FR-FEAT-16, FR-FEAT-17, FR-FEAT-18
**Relevant PROJECT.md sections**: 2.11, 4.2, 4.5, 4.7, 8

**What this implements**: Author books a weekly feature slot (paid, one-time); eligibility checks (3-month window, slot availability); Stripe Payment Intent; booking confirmation via webhook; Author booking history.

**Prerequisites**: `packages/shared/src/features/booking-eligibility.ts` created; SSM config params for `weekly_feature_fee_cents` and `weekly_feature_max_slots` seeded; Stripe secret in Secrets Manager; `subscriptions/webhook-processing.md` complete (handles `payment_intent.*` events); `features-lambda` deployed

**Done when**:
- [ ] `checkBookingEligibility()` rejects Author with CONFIRMED booking in last 3 months → 409 (FR-FEAT-11)
- [ ] Fully-booked week (slot count at max) rejects new booking → 409; `isoWeek` > 8 weeks from now → 400
- [ ] `payment_intent.succeeded` webhook sets booking `featureStatus=CONFIRMED`; `payment_intent.payment_failed` sets `featureStatus=CANCELLED, cancelledBy=STRIPE_PAYMENT_FAILED`
- [ ] `GET /features/weekly/available` returns correct `available: boolean` per week based on current CONFIRMED count vs SSM max
- [ ] Spec `**Status**` updated to ✅ Implemented

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
1. `GET /features/weekly/available` — returns next 8 weeks with slot availability:
   - For each week: slot count (max from SSM config, default 10), confirmed bookings count, `available: boolean`
2. `POST /features/weekly/book` — body: `{ isoWeek }`:
   - Must be ACTIVE Author with `connectChargesEnabled=true`
   - Validate `isoWeek` is within 8-week booking window (FR-FEAT-14)
   - `checkBookingEligibility()`: query Author's bookings in last 3 months → if any CONFIRMED → 409 (FR-FEAT-11)
   - Check slot availability: `getSlotCount(isoWeek)` < maxSlots → if full → 409
   - Read weekly feature fee from SSM config (default $25)
   - Create Stripe Payment Intent (`amount=featureFee, currency=usd, metadata: { type:'WEEKLY_FEATURE', isoWeek, authorId, bookingId }`)
   - Write booking record with status=`PENDING`
   - Return: `{ paymentIntentClientSecret, bookingId }`
3. Webhook (`payment_intent.succeeded` with `metadata.type=WEEKLY_FEATURE`):
   - Lookup booking by `PK=FEATURE#WEEK#{isoWeek}, SK=AUTHOR#{authorId}`
   - Set `featureStatus=CONFIRMED`
   - Update Author key record
4. Webhook (`payment_intent.payment_failed`):
   - Set `featureStatus=CANCELLED`, `cancelledBy=STRIPE_PAYMENT_FAILED`
5. `GET /features/weekly/my-bookings` — Author's upcoming + past bookings with payment receipt data

**Error conditions**:
- Author already has CONFIRMED booking within 3-month window → 409
- Week fully booked → 409
- `isoWeek` > 8 weeks from now → 400
- Author `connectChargesEnabled=false` → 400

**Tests to write**:
- Unit: `checkBookingEligibility()` date range logic; 8-week window calculation; slot count
- Integration: book → verify PENDING record + Payment Intent; webhook confirms → CONFIRMED; 3-month window blocks second booking
