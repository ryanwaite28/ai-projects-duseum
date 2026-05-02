## Spec: Featured Authors UI

**Status**: ✅ Implemented
**FR coverage**: FR-FEAT-07, FR-FEAT-08, FR-FEAT-10, FR-FEAT-12, FR-FEAT-16
**Relevant PROJECT.md sections**: 2.11, 6.8

**What this implements**: Daily Featured Author hero spotlight on homepage; Weekly Featured Authors carousel; Author weekly feature booking flow (calendar + Stripe payment).

**Prerequisites**: Features API endpoints complete (`features/daily-featured.md`, `features/weekly-booking.md`); Stripe.js loaded in `index.html`; Author dashboard exists; booking form component scaffolded

**Done when**:
- [x] `WeeklyFeaturedCarousel` array shuffled client-side on every mount — order not fixed across renders
- [x] `DailyFeaturedSpotlight` renders cover photo, bio excerpt, and pinned pieces from API
- [x] Booking calendar disables fully-booked weeks and current ISO week
- [x] "Book this week" CTA calls `POST /features/weekly/book` → receives `paymentIntentClientSecret`
- [x] Stripe.js `confirmPayment()` called with client secret; on success → confirmation shown + history updated
- [x] Booking page visible to active Authors only (auth guard redirects non-Authors)
- [x] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `frontend/src/components/home/DailyFeaturedSpotlight.tsx` — hero section for Daily Featured Author
- `frontend/src/components/home/WeeklyFeaturedCarousel.tsx` — 10-slot featured Authors carousel
- `frontend/src/pages/features/book-weekly.tsx` — Author-only booking page (calendar + payment)
- `frontend/src/services/features.service.ts` — `getDailyFeatured()`, `getWeeklyFeatured()`, `getAvailableWeeks()`, `bookWeeklyFeature()`

**Design system**:
- Daily Featured Spotlight: full-width hero with radial glow; cover photo background; Playfair Display Author name; bio excerpt in DM Sans; pinned pieces row
- Weekly Featured Carousel: horizontal scroll grid; each card: `bg-ink-soft border border-gold/10`; cover photo, displayName, 2 piece thumbnails, "View Profile" link
- Weekly carousel order: **randomized each page load** — no fixed positions (FR-FEAT-16)
- Booking calendar: week picker showing next 8 weeks; `bg-gold/10` for available; `bg-stone/10 opacity-50` for full; current week disabled

**Business logic**:
1. `DailyFeaturedSpotlight`: `GET /features/homepage` → render hero; "Follow" + "Subscribe" CTAs
2. `WeeklyFeaturedCarousel`: same homepage call → shuffle `weeklyFeatured` array client-side before render
3. Booking flow (Author only — show only if Author profile active):
   - `GET /features/weekly/available` → show 8-week calendar grid with slot counts
   - Select week → check `available=true` → "Book this week for $25" CTA
   - Click → `POST /features/weekly/book` → receive `paymentIntentClientSecret`
   - Stripe.js `confirmPayment()` with Elements inline or redirect
   - On success → show confirmation; update booking history
4. `GET /features/weekly/my-bookings` → upcoming + past bookings in Author Dashboard bookings tab

**Tests to write**:
- Component: `WeeklyFeaturedCarousel` renders shuffled order (verify array is randomized on mount)
- Component: booking calendar disables fully-booked weeks; disables current week
