## Spec: Author Directory

**Status**: ✅ Implemented
**FR coverage**: FR-DISC-04
**Relevant PROJECT.md sections**: 2.8, 4.2, 4.7, 6.8, 8

**What this implements**: `listAuthors()` DynamoDB repository function using `GSI-AuthorDirectory`; `GET /authors` route already exists and calls the repo function — so this spec completes the missing backend piece then delivers the full `AuthorsPage` UI with sort controls and paginated author cards.

**Prerequisites**: `users/author-onboarding.md` complete; `GSI-AuthorDirectory` provisioned (`profileType='AUTHOR'` / `createdAt` SK); `createAuthorProfile()` already writes `profileType='AUTHOR'` attribute (confirmed in users.repository.ts L157)

**Current state**:
- `lambdas/users/src/routes/list-authors.ts` — ✅ exists; validates params and calls `listAuthorsRepo` from `@duseum/shared`
- `packages/shared/src/db/users.repository.ts` — ❌ `listAuthors()` function not yet implemented
- `frontend/src/services/authors.service.ts` — ✅ `listAuthors()` API wrapper exists
- `frontend/src/hooks/use-author.ts` — ❌ no `useAuthors` infinite query hook
- `frontend/src/pages/authors.tsx` — ❌ "Coming soon" placeholder

**Done when**:
- [x] `listAuthors()` exported from `packages/shared/src/db/users.repository.ts`; queries `GSI-AuthorDirectory` with `profileType = :author` and `FilterExpression: status = ACTIVE`
- [x] `sort=newest` uses GSI forward scan (createdAt ascending → reverse with `ScanIndexForward: false`); `sort=subscriberCount` uses application-side sort on the result page
- [x] SUSPENDED and DEACTIVATED authors excluded via FilterExpression
- [x] Cursor-based pagination: `lastKey` in/out as `Record<string, unknown>`; limit clamped 1–50
- [x] `useAuthors(sort)` infinite query hook added to `frontend/src/hooks/use-author.ts`
- [x] `AuthorsPage` renders hero, sort toggle (Newest / Most Subscribers), paginated author card grid
- [x] Each author card shows: display name, bio excerpt (max 100 chars), follower count, subscriber count, subscription price badge if set
- [x] "Load more" button increments infinite query; loading skeleton shown on first load
- [x] Empty state shown when no authors returned
- [x] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `packages/shared/src/db/users.repository.ts` — add `listAuthors(client, opts)` using `GSI-AuthorDirectory`
- `frontend/src/hooks/use-author.ts` — add `useAuthors(sort)` infinite query
- `frontend/src/pages/authors.tsx` — full implementation replacing "Coming soon" placeholder

**DynamoDB access patterns used**:
- Author directory (newest): `GSI-AuthorDirectory` — `profileType = 'AUTHOR'`, `ScanIndexForward: false`, `FilterExpression: #status = :active`, limit N, cursor via ExclusiveStartKey
- Author directory (subscriberCount): same GSI query, then sort result page by `subscriberCount DESC` in application layer (acceptable for page sizes ≤ 50; no separate GSI needed)

**API contract** (`GET /authors`):
```
Query params: sort=newest|subscriberCount (default: newest), limit=1–50 (default: 20), cursor=<base64url>
Response: { items: AuthorProfile[], nextCursor: string | null }
```
Response fields per item: `userId`, `displayName`, `bio`, `followerCount`, `subscriberCount`, `authorSubscriptionMonthlyUsd` (null if disabled), `createdAt`

**Design system**:
- Page hero: standard pattern (`bg-ink` + radial glow + `EyebrowLabel` "Directory" + Playfair h1 with `<em>` emphasis)
- Sort toggle: two ghost/nav buttons; active state uses `border-gold text-gold`, inactive `border-gold/25 text-stone-light`
- Author card: `bg-ink-soft border border-gold/10 rounded-sm p-6 hover:border-gold/30 hover:bg-gold/[0.03] transition-all`; gold subscription price badge when price is set; muted "Free" badge when null
- Grid: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`
- Skeleton: 6 cards `h-40 bg-ink-soft animate-pulse rounded-sm`

**Business logic**:
1. `listAuthors(client, { sort, limit, lastKey })`:
   - Always queries `GSI-AuthorDirectory` with `KeyConditionExpression: profileType = :author`
   - `FilterExpression: #status = :active` (value `'ACTIVE'`) to exclude SUSPENDED/DEACTIVATED
   - `ScanIndexForward: false` for newest-first (createdAt DESC is the GSI SK)
   - For `sort=subscriberCount`: fetch one page, sort by `subscriberCount DESC` in memory; pagination is approximate (last item's key used as cursor)
   - Returns `{ items: AuthorProfile[], lastKey: Record<string, unknown> | undefined }`
2. `useAuthors(sort)`: `useInfiniteQuery` keyed `['authors', 'list', sort]`; `getNextPageParam` reads `nextCursor`
3. `AuthorsPage`: URL param `?sort=newest|subscriberCount` synced with `useSearchParams`; changing sort resets to page 1

**Error conditions**:
- Invalid `sort` value → 400 (already validated in route handler)
- Invalid cursor → 400 (already validated in route handler)
- `limit` out of 1–50 range → 400 (already validated in route handler)

**Tests to write**:
- Unit: `listAuthors()` with `status=SUSPENDED` seed item — verify it's excluded from results
- Unit: `sort=subscriberCount` returns items in descending subscriber order within a page
- Integration: seed 3 authors, call `GET /authors?sort=newest&limit=2` — verify cursor and second page
- Component: sort toggle updates URL param and re-fetches with new sort key
