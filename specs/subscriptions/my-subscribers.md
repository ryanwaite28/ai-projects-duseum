## Spec: Author Subscriber List

**Status**: ✅ Implemented
**FR coverage**: FR-AUTH-PROF-09, FR-SUB-02
**Relevant PROJECT.md sections**: 2.7, 4.2, 4.7, 8.6

**What this implements**: `GET /subscriptions/me/subscribers` endpoint returning paginated active subscriber records for the authenticated author; `SubscribersTab` component in the Author Dashboard showing subscriber count, per-subscriber status rows, and cursor-based pagination.

**Prerequisites**: `subscriptions/author-checkout.md` complete; `subscriptions/webhook-processing.md` complete; `GSI-SubscribersByAuthor` provisioned; `listAuthorSubscribersByAuthor()` in `packages/shared`

**Done when**:
- [x] `GET /subscriptions/me/subscribers` returns 403 when caller has no AuthorProfile
- [x] Response includes `items[]`, `nextCursor` (base64url-encoded, null on last page), and `total` (from `authorProfile.subscriberCount`)
- [x] Pagination: `cursor` query param decoded as base64url JSON → `ExclusiveStartKey`; invalid cursor silently ignored (treated as first page)
- [x] Route registered in `subscriptions/src/index.ts` before the `/me` catch-all to prevent prefix collision
- [x] `SubscribersTab` shows denormalized `subscriberCount` as hero stat
- [x] Subscriber table columns: Subscriber ID (truncated), Since, Renews, Status
- [x] Status colour-coding: ACTIVE → green, PAST_DUE → gold, CANCELLED/INCOMPLETE → stone, PAUSED → parchment-dim
- [x] Empty state shown when no subscribers and not on a subsequent page
- [x] Prev/Next pagination buttons only shown when there is history or a next cursor
- [x] `SubscribersTab` added to Author Dashboard tab list between "Pinned Pieces" and "Analytics"
- [x] `MySubscribersResponse` and `SubscriberItem` types added to `subscriptions.service.ts`
- [x] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `lambdas/subscriptions/src/routes/get-my-subscribers.ts` — (new) `GET /subscriptions/me/subscribers`
- `lambdas/subscriptions/src/index.ts` — register new route before `/me` match
- `frontend/src/services/subscriptions.service.ts` — add `SubscriberItem`, `MySubscribersResponse`, `getMySubscribers(cursor?)`
- `frontend/src/pages/dashboard/tabs/subscribers-tab.tsx` — (new) subscriber list with pagination
- `frontend/src/pages/dashboard/author.tsx` — add `subscribers` TabId; import + render `SubscribersTab`

**DynamoDB access patterns used**:
- Subscriber list by author: `GSI-SubscribersByAuthor` — `authorId = :authorId` with `status = ACTIVE` filter; limit 500; cursor via `ExclusiveStartKey`

**Business logic**:
1. `GET /subscriptions/me/subscribers`:
   - Verify `userId` in context (401 if absent)
   - `getAuthorProfile(docClient, userId)` — throws `ForbiddenError` (403) if null
   - Decode `cursor` query param from base64url JSON → `ExclusiveStartKey` for DynamoDB; invalid cursor → undefined (first page)
   - `listAuthorSubscribersByAuthor(docClient, userId, lastKey)` via `GSI-SubscribersByAuthor`
   - Encode `result.lastKey` as base64url JSON for `nextCursor`; null if no more pages
   - Return `{ items, nextCursor, total: author.subscriberCount }`
2. `SubscribersTab` client-side pagination: maintains a `pages` cursor history array; "Previous" pops last cursor and navigates back; "Next" pushes current cursor and advances
3. Each query keyed as `['subscriptions', 'me', 'subscribers', cursor]` — React Query caches each page independently

**Error conditions**:
- Caller has no AuthorProfile → 403 `Author profile required`
- Malformed `cursor` param → silently treated as first page (no 400)

**Tests to write**:
- Unit: `GET /subscriptions/me/subscribers` returns 403 for non-author user
- Unit: cursor encoding/decoding round-trips correctly for arbitrary `LastEvaluatedKey`
- Component: `SubscribersTab` renders empty state when `items.length === 0` on first page
- Component: Next button disabled when `nextCursor` is null; Previous button disabled on first page
