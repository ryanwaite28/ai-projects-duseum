# Data Model — DynamoDB Single-Table Design

> Reference document — not a spec. No Status or FR coverage fields.
> This is the canonical source of truth for PK/SK patterns and attribute names.
> Before writing any DynamoDB read or write, verify your attribute names match this document.
> If the actual code diverges from this document, update this document first.

---

## Tables

| Table | CDK name | Purpose | TTL attribute |
|---|---|---|---|
| Main | `duseum-{env}-dynamodb-main` | All transactional application data | none |
| Idempotency | `duseum-{env}-dynamodb-idempotency` | Stripe webhook event deduplication | `ttl` (epoch seconds) |
| Config | `duseum-{env}-dynamodb-config` | Platform config, featured author state | none |

---

## GSIs — Main Table

All GSIs project **ALL** attributes.

> **Note**: Actual GSI names use descriptive identifiers (not `GSI1/GSI2/GSI3`). Confirmed from `designs/infrastructure/storage-stack.md`.

| GSI name | Partition key attribute | Sort key attribute | Purpose |
|---|---|---|---|
| `GSI-AuthorPublic` | `authorId` | `visibility#createdAt` | Author's public piece gallery |
| `GSI-AllPublicPieces` | `status` | `createdAt` | Global public piece browse |
| `GSI-FollowersByAuthor` | `authorId` | `followedAt` | Followers of an Author (notification fan-out) |
| `GSI-SubscribersByAuthor` | `authorId` | `subscribedAt` | Subscribers of an Author |
| `GSI-TagIndex` | `tag` | `createdAt` | Tag-based artwork browse |
| `GSI-WeeklyFeatureByStatus` | `featureStatus` | `isoWeek` | Weekly feature booking queries |

---

## Record Types — Main Table

### User & Profile Records

#### User base record
- **PK**: `USER#{userId}` **SK**: `PROFILE`
- **Attributes**: `userId`, `email`, `systemRole` (`'USER' | 'ADMIN'`), `emailVerified`, `createdAt`, `lastLoginAt`
- **Note**: SK is `PROFILE` (not `META`) — confirmed from actual implementation in `designs/auth/post-confirmation.md`
- **Table**: Main

#### Viewer profile
- **PK**: `USER#{userId}` **SK**: `PROFILE#VIEWER`
- **Attributes**: `userId`, `email`, `displayName`, `bio`, `avatarKey`, `status` (`'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED'`), `createdAt`, `updatedAt`, `reactivationDeadline?`
- **GSI1**: `GSI1PK = 'ENTITY#VIEWER'`, `GSI1SK = USER#{userId}`
- **Table**: Main

#### Author profile
- **PK**: `USER#{userId}` **SK**: `PROFILE#AUTHOR`
- **Attributes**: `userId`, `displayName`, `bio`, `avatarKey`, `coverPhotoKey`, `status` (`'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED'`), `subscriptionPriceId?`, `stripePriceId?`, `stripeConnectAccountId?`, `connectChargesEnabled` (boolean), `stripeCustomerId?`, `pinnedPieceIds` (string[]), `followerCount` (number), `subscriberCount` (number), `createdAt`, `updatedAt`, `reactivationDeadline?`
- **GSI1**: `GSI1PK = 'ENTITY#AUTHOR'`, `GSI1SK = USER#{createdAt}` (sort by join date)
- **Table**: Main

---

### Art Piece Records

#### Art piece metadata
- **PK**: `ART#{pieceId}` **SK**: `META`
- **Attributes**: `pieceId`, `authorId`, `title`, `description`, `visibility` (`'PUBLIC' | 'PRIVATE'`), `status` (`'DRAFT' | 'PUBLISHED' | 'ARCHIVED'`), `mimeType`, `s3Key`, `thumbnailKey`, `viewCount` (number), `commentCount` (number), `reactionCounts` (map: `{ LOVE: number, WOW: number, FIRE: number, INSPIRED: number }`), `trendScore` (number), `tags` (string[]), `category`, `commentsEnabled` (boolean), `notificationsSent` (number), `publishedAt?`, `createdAt`, `updatedAt`
- **GSI1**: `GSI1PK = 'AUTHOR#{authorId}'`, `GSI1SK = 'ART#{createdAt}'`
- **GSI2** (written only when status=PUBLISHED and visibility=PUBLIC, for each tag): `GSI2PK = 'TAG#{tag}'`, `GSI2SK = 'ART#{publishedAt}'`
- **GSI3** (written only when status=PUBLISHED and visibility=PUBLIC): `GSI3PK = 'BROWSE#PUBLIC'`, `GSI3SK = '{publishedAt}'`
- **Table**: Main

---

### Collection Records

#### Collection metadata
- **PK**: `COL#{collectionId}` **SK**: `META`
- **Attributes**: `collectionId`, `authorId`, `title`, `description`, `visibility` (`'PUBLIC' | 'PRIVATE'`), `coverImageKey?`, `totalPieces` (number), `createdAt`, `updatedAt`
- **GSI1**: `GSI1PK = 'AUTHOR#{authorId}'`, `GSI1SK = 'COL#{createdAt}'`
- **Table**: Main

#### Collection → Piece membership (forward)
- **PK**: `COL#{collectionId}` **SK**: `ART#{pieceId}`
- **Attributes**: `collectionId`, `pieceId`, `sortOrder` (number), `addedAt`
- **Table**: Main

#### Piece → Collection membership (reverse)
- **PK**: `ART#{pieceId}` **SK**: `COL#{collectionId}`
- **Attributes**: `pieceId`, `collectionId`, `collectionTitle` (denormalized)
- **Table**: Main

---

### Follow & Notification Records

#### Follow relationship
- **PK**: `USER#{followerId}` **SK**: `FOLLOW#{authorId}`
- **Attributes**: `followerId`, `authorId`, `notificationPreference` (`'ALL' | 'SUBSCRIBERS_ONLY' | 'NONE'`), `createdAt`
- **GSI1**: `GSI1PK = 'AUTHOR#{authorId}'`, `GSI1SK = 'FOLLOW#{createdAt}'` (followers of this Author)
- **Table**: Main

#### Notification preferences (global opt-out)
- **PK**: `USER#{userId}` **SK**: `NOTIF#META`
- **Attributes**: `userId`, `globalOptOut` (boolean), `updatedAt`
- **Table**: Main

---

### Subscription Records

#### Platform subscription
- **PK**: `USER#{userId}` **SK**: `SUB#PLATFORM`
- **Attributes**: `userId`, `stripeCustomerId`, `stripeSubscriptionId`, `status` (`'ACTIVE' | 'CANCELLED' | 'PAUSED'`), `currentPeriodEnd`, `createdAt`, `updatedAt`
- **Table**: Main

#### Author subscription
- **PK**: `USER#{subscriberId}` **SK**: `SUB#AUTHOR#{authorId}`
- **Attributes**: `subscriberId`, `authorId`, `stripeSubscriptionId`, `status` (`'ACTIVE' | 'CANCELLED' | 'PAUSED'`), `currentPeriodEnd`, `createdAt`, `updatedAt`
- **GSI1**: `GSI1PK = 'AUTHOR#{authorId}'`, `GSI1SK = 'SUB#{createdAt}'` (subscribers of this Author)
- **Table**: Main

#### Stripe Connect reverse lookup
- **PK**: `CONNECT#{stripeConnectAccountId}` **SK**: `META`
- **Attributes**: `stripeConnectAccountId`, `authorId`, `userId`
- **Table**: Main

---

### Comment Records

#### Top-level comment
- **PK**: `ART#{pieceId}` **SK**: `COMMENT#{createdAt}#{commentId}`
- **Attributes**: `commentId`, `pieceId`, `userId` (commenter), `content`, `isPinned` (boolean), `hidden` (boolean), `createdAt`
- **Table**: Main

#### Reply
- **PK**: `COMMENT#{commentId}` **SK**: `REPLY#{createdAt}#{replyId}`
- **Attributes**: `replyId`, `commentId`, `userId` (replier), `content`, `hidden` (boolean), `createdAt`
- **Table**: Main

---

### Reaction Records

#### Reaction
- **PK**: `ART#{pieceId}` **SK**: `REACTION#{userId}`
- **Attributes**: `pieceId`, `userId`, `reactionType` (`'LOVE' | 'WOW' | 'FIRE' | 'INSPIRED'`), `createdAt`
- **Note**: Aggregate counts are stored on the Art Piece META record as `reactionCounts.{type}`
- **Table**: Main

---

### Upload Intent Records

#### Upload intent
- **PK**: `UPLOAD#{intentId}` **SK**: `META`
- **Attributes**: `intentId`, `userId`, `mimeType`, `s3Key`, `status` (`'PENDING' | 'CONFIRMED'`), `expiresAt` (ISO 8601), `createdAt`
- **Note**: S3 lifecycle rule deletes objects under `upload-intent/` prefix after 1 day; DynamoDB record cleaned up separately
- **Table**: Main

---

### Feature & Booking Records

#### Weekly feature booking
- **PK**: `FEATURE#WEEK#{isoWeek}` **SK**: `AUTHOR#{authorId}`
- **Attributes**: `isoWeek`, `authorId`, `userId`, `featureStatus` (`'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'ARCHIVED'`), `paymentIntentId`, `bookedAt`, `paidAt?`, `cancelledBy?` (`'ADMIN'`), `cancelledByAdminId?`, `refundedAt?`
- **Table**: Main (or Config — confirm from api-stack env vars)

---

### Config Table Records

#### Daily featured author (current)
- **PK**: `CONFIG#DAILY_FEATURED_AUTHOR` **SK**: `META`
- **Attributes**: `authorId`, `selectedAt`, `isOverride` (boolean), `overriddenBy?` (adminUserId)
- **Table**: Config

#### Daily featured history entry
- **PK**: `CONFIG#DAILY_FEATURED_AUTHOR` **SK**: `HISTORY#{YYYY-MM-DD}`
- **Attributes**: `authorId`, `selectedAt`
- **Table**: Config

#### Weekly featured authors (active list)
- **PK**: `CONFIG#WEEKLY_FEATURED` **SK**: `META`
- **Attributes**: `isoWeek`, `authorIds` (string[]), `updatedAt`
- **Table**: Config

---

### Idempotency Table Records

#### Stripe event deduplication
- **PK**: `{stripeEventId}` (no sort key — table is PK-only)
- **Attributes**: `eventId`, `processedAt`, `ttl` (epoch seconds — 48-hour expiry)
- **Note**: Idempotency table has no SK. Confirmed from `designs/infrastructure/storage-stack.md`.
- **Table**: Idempotency

---

## Access Pattern Index

| Access Pattern | Table | Key Expression |
|---|---|---|
| Get user base record | Main | `PK=USER#{id}, SK=PROFILE` |
| Get viewer profile | Main | `PK=USER#{id}, SK=PROFILE#VIEWER` |
| Get author profile | Main | `PK=USER#{id}, SK=PROFILE#AUTHOR` |
| Author's public pieces | Main — GSI-AuthorPublic | `authorId={id}, visibility#createdAt begins_with PUBLIC#` |
| All public pieces (recent) | Main — GSI-AllPublicPieces | `status=PUBLISHED` sort by `createdAt` desc |
| Followers of author | Main — GSI-FollowersByAuthor | `authorId={id}` sort by `followedAt` |
| Subscribers of author | Main — GSI-SubscribersByAuthor | `authorId={id}` sort by `subscribedAt` |
| Browse by tag | Main — GSI-TagIndex | `tag={tag}` sort by `createdAt` desc |
| Weekly bookings by status | Main — GSI-WeeklyFeatureByStatus | `featureStatus=CONFIRMED` sort by `isoWeek` |
| Piece detail | Main | `PK=ART#{id}, SK=META` |
| Comments on piece | Main | `PK=ART#{id}, SK begins_with COMMENT#` |
| Replies to comment | Main | `PK=COMMENT#{id}, SK begins_with REPLY#` |
| Reaction by user on piece | Main | `PK=ART#{id}, SK=REACTION#{userId}` |
| Pieces in collection | Main | `PK=COL#{id}, SK begins_with ART#` |
| Collections containing piece | Main | `PK=ART#{id}, SK begins_with COL#` |
| Weekly booking by week | Main | `PK=FEATURE#WEEK#{isoWeek}, SK begins_with AUTHOR#` |
| Stripe Connect reverse lookup | Main | `PK=CONNECT#{connectId}, SK=META` |
| Platform subscription | Main | `PK=USER#{id}, SK=SUB#PLATFORM` |
| Author subscription | Main | `PK=USER#{id}, SK=SUB#AUTHOR#{authorId}` |
| Upload intent | Main | `PK=UPLOAD#{id}, SK=META` |
| Daily featured current | Config | `PK=CONFIG#DAILY_FEATURED_AUTHOR, SK=META` |
| Daily featured history | Config | `PK=CONFIG#DAILY_FEATURED_AUTHOR, SK begins_with HISTORY#` |
| Weekly featured list | Config | `PK=CONFIG#WEEKLY_FEATURED, SK=META` |
| Idempotency check | Idempotency | `PK={stripeEventId}, SK=META` |

---

## Atomic Counter Pattern

DynamoDB atomic increments/decrements use `UpdateExpression` with `ADD`:

```typescript
// Increment followerCount on Author profile
await ddb.send(new UpdateCommand({
  TableName: mainTable,
  Key: { PK: `USER#${authorId}`, SK: 'PROFILE#AUTHOR' },
  UpdateExpression: 'ADD followerCount :inc',
  ExpressionAttributeValues: { ':inc': 1 },
}));
```

Floor at zero for decrements: use `SET followerCount = if_not_exists(followerCount, :zero) - :dec` with a `ConditionExpression: 'followerCount > :zero'` or clamp in application code.

---

## Idempotency Pattern

All Stripe webhook handlers check-then-write:

```typescript
// 1. Check idempotency table
const existing = await ddb.send(new GetCommand({
  TableName: idempotencyTable,
  Key: { PK: event.id, SK: 'META' },
}));
if (existing.Item) return; // already processed — skip

// 2. Process event
// ...

// 3. Write idempotency record (TTL = now + 48h)
await ddb.send(new PutCommand({
  TableName: idempotencyTable,
  Key: { PK: event.id, SK: 'META' },
  Item: { PK: event.id, SK: 'META', processedAt: new Date().toISOString(), ttl: Math.floor(Date.now() / 1000) + 172800 },
}));
```
