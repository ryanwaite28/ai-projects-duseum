## Spec: Billing Portal Error Message + Upgrade Button Fix

**Status**: ✅ Implemented
**FR coverage**: FR-SUB-09, FR-SUB-01
**Relevant PROJECT.md sections**: 2.7, 4.2

**What this implements**: Two related fixes:
1. **Backend**: `POST /subscriptions/portal` currently returns a generic 400 with message "No billing account found. Subscribe to a plan first." The frontend swallows this and shows "Failed to open portal." Fix: the frontend must surface the API error message and guide the user to subscribe.
2. **Frontend**: The "Upgrade" button on `/settings/subscriptions` is incorrectly calling `POST /subscriptions/portal` instead of `POST /subscriptions/platform`. It must call the checkout endpoint.

**Root cause analysis**:
- The backend portal error message is already correct and specific — it is the frontend catch block that replaces it with a generic string.
- The Upgrade button on the subscriptions settings page calls the wrong API endpoint (portal instead of platform checkout).

**New/modified files**:
- `frontend/src/` — two targeted frontend changes (exact files TBD by frontend file search at implementation time):
  1. Billing portal button error handler: replace generic catch message with the API error `message` field; add a CTA link to `/settings/subscriptions` if the error message contains "Subscribe to a plan first"
  2. Upgrade button: ensure it calls `POST /subscriptions/platform` (checkout) not `POST /subscriptions/portal`

**No backend changes needed** — `create-portal-session.ts` error message is already correct; `create-platform-checkout.ts` already calls `getOrCreateStripeCustomer()` which handles missing customer IDs.

**Business logic**:
1. Billing portal error: catch the API error → if `error.message` exists, display it verbatim → if message includes "Subscribe to a plan first", render a "Subscribe now →" link to `/settings/subscriptions`
2. Upgrade button: call `POST /subscriptions/platform` → redirect to `checkoutUrl`

**Done when**:
- [x] Clicking "Open Billing Portal" with no subscription shows the exact API error message and a link to subscribe
- [x] Clicking "Upgrade" initiates a Stripe Checkout session (redirect to `checkoutUrl`)

**Tests to write**: none new — UI behaviour, manual verification sufficient
