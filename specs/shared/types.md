# Shared TypeScript Interfaces

> Reference document — not a spec. No Status or FR coverage fields.
> Canonical TypeScript interface definitions for `packages/shared/src/types/index.ts`.
> If a new interface is needed, define it here first, then implement it in the types file.
> Interface changes require updating this document and the types file together.

---

## DynamoDB Record Interfaces

These map 1:1 to the record shapes in `specs/data-model.md`.

```typescript
// Base record fields on every item
interface DynamoRecord {
  PK: string;
  SK: string;
}

// --- User & Profile ---

interface UserRecord extends DynamoRecord {
  // PK: USER#{userId}, SK: META
  userId: string;
  email: string;
  role: 'USER';
  createdAt: string;
  updatedAt: string;
}

interface ViewerProfileRecord extends DynamoRecord {
  // PK: USER#{userId}, SK: PROFILE#VIEWER
  userId: string;
  email: string;
  displayName: string;
  bio?: string;
  avatarKey?: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  createdAt: string;
  updatedAt: string;
  reactivationDeadline?: string;  // ISO 8601
  // GSI1PK: ENTITY#VIEWER, GSI1SK: USER#{userId}
  GSI1PK: string;
  GSI1SK: string;
}

interface AuthorProfileRecord extends DynamoRecord {
  // PK: USER#{userId}, SK: PROFILE#AUTHOR
  userId: string;
  displayName: string;
  bio?: string;
  avatarKey?: string;
  coverPhotoKey?: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  subscriptionPriceId?: string;   // Stripe Price ID (active)
  stripePriceId?: string;         // alias — same field
  stripeConnectAccountId?: string;
  connectChargesEnabled: boolean;
  stripeCustomerId?: string;
  pinnedPieceIds: string[];
  followerCount: number;
  subscriberCount: number;
  createdAt: string;
  updatedAt: string;
  reactivationDeadline?: string;
  // GSI1PK: ENTITY#AUTHOR, GSI1SK: USER#{createdAt}
  GSI1PK: string;
  GSI1SK: string;
}

// --- Art Piece ---

type ReactionType = 'LOVE' | 'WOW' | 'FIRE' | 'INSPIRED';

interface ArtPieceRecord extends DynamoRecord {
  // PK: ART#{pieceId}, SK: META
  pieceId: string;
  authorId: string;
  title: string;
  description?: string;
  visibility: 'PUBLIC' | 'PRIVATE';
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  mimeType: string;
  s3Key: string;
  thumbnailKey?: string;
  viewCount: number;
  commentCount: number;
  reactionCounts: Record<ReactionType, number>;
  trendScore: number;
  tags: string[];
  category?: string;
  commentsEnabled: boolean;
  notificationsSent: number;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
  // GSI1PK: AUTHOR#{authorId}, GSI1SK: ART#{createdAt}
  GSI1PK: string;
  GSI1SK: string;
  // GSI2/GSI3 written only for PUBLIC+PUBLISHED pieces
  GSI2PK?: string;  // TAG#{tag} — written per tag
  GSI2SK?: string;  // ART#{publishedAt}
  GSI3PK?: string;  // BROWSE#PUBLIC
  GSI3SK?: string;  // {publishedAt}
}

// --- Collection ---

interface CollectionRecord extends DynamoRecord {
  // PK: COL#{collectionId}, SK: META
  collectionId: string;
  authorId: string;
  title: string;
  description?: string;
  visibility: 'PUBLIC' | 'PRIVATE';
  coverImageKey?: string;
  totalPieces: number;
  createdAt: string;
  updatedAt: string;
  // GSI1PK: AUTHOR#{authorId}, GSI1SK: COL#{createdAt}
  GSI1PK: string;
  GSI1SK: string;
}

interface CollectionMemberRecord extends DynamoRecord {
  // PK: COL#{collectionId}, SK: ART#{pieceId}
  collectionId: string;
  pieceId: string;
  sortOrder: number;
  addedAt: string;
}

interface CollectionReverseRecord extends DynamoRecord {
  // PK: ART#{pieceId}, SK: COL#{collectionId}
  pieceId: string;
  collectionId: string;
  collectionTitle: string;  // denormalized
}

// --- Follow ---

type NotificationPreference = 'ALL' | 'SUBSCRIBERS_ONLY' | 'NONE';

interface FollowRecord extends DynamoRecord {
  // PK: USER#{followerId}, SK: FOLLOW#{authorId}
  followerId: string;
  authorId: string;
  notificationPreference: NotificationPreference;
  createdAt: string;
  // GSI1PK: AUTHOR#{authorId}, GSI1SK: FOLLOW#{createdAt}
  GSI1PK: string;
  GSI1SK: string;
}

interface NotificationPreferenceRecord extends DynamoRecord {
  // PK: USER#{userId}, SK: NOTIF#META
  userId: string;
  globalOptOut: boolean;
  updatedAt: string;
}

// --- Subscription ---

type SubscriptionStatus = 'ACTIVE' | 'CANCELLED' | 'PAUSED';

interface PlatformSubscriptionRecord extends DynamoRecord {
  // PK: USER#{userId}, SK: SUB#PLATFORM
  userId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: SubscriptionStatus;
  currentPeriodEnd: string;
  createdAt: string;
  updatedAt: string;
}

interface AuthorSubscriptionRecord extends DynamoRecord {
  // PK: USER#{subscriberId}, SK: SUB#AUTHOR#{authorId}
  subscriberId: string;
  authorId: string;
  stripeSubscriptionId: string;
  status: SubscriptionStatus;
  currentPeriodEnd: string;
  createdAt: string;
  updatedAt: string;
  // GSI1PK: AUTHOR#{authorId}, GSI1SK: SUB#{createdAt}
  GSI1PK: string;
  GSI1SK: string;
}

interface ConnectReverseRecord extends DynamoRecord {
  // PK: CONNECT#{stripeConnectAccountId}, SK: META
  stripeConnectAccountId: string;
  authorId: string;
  userId: string;
}

// --- Comment & Reaction ---

interface CommentRecord extends DynamoRecord {
  // PK: ART#{pieceId}, SK: COMMENT#{createdAt}#{commentId}
  commentId: string;
  pieceId: string;
  userId: string;
  content: string;
  isPinned: boolean;
  hidden: boolean;
  createdAt: string;
}

interface ReplyRecord extends DynamoRecord {
  // PK: COMMENT#{commentId}, SK: REPLY#{createdAt}#{replyId}
  replyId: string;
  commentId: string;
  userId: string;
  content: string;
  hidden: boolean;
  createdAt: string;
}

interface ReactionRecord extends DynamoRecord {
  // PK: ART#{pieceId}, SK: REACTION#{userId}
  pieceId: string;
  userId: string;
  reactionType: ReactionType;
  createdAt: string;
}

// --- Upload Intent ---

interface UploadIntentRecord extends DynamoRecord {
  // PK: UPLOAD#{intentId}, SK: META
  intentId: string;
  userId: string;
  mimeType: string;
  s3Key: string;
  status: 'PENDING' | 'CONFIRMED';
  expiresAt: string;  // ISO 8601
  createdAt: string;
}

// --- Feature & Booking ---

type FeatureStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'ARCHIVED';

interface WeeklyBookingRecord extends DynamoRecord {
  // PK: FEATURE#WEEK#{isoWeek}, SK: AUTHOR#{authorId}
  isoWeek: string;          // e.g. "2026-W17"
  authorId: string;
  userId: string;
  featureStatus: FeatureStatus;
  paymentIntentId: string;
  bookedAt: string;
  paidAt?: string;
  cancelledBy?: 'ADMIN';
  cancelledByAdminId?: string;
  refundedAt?: string;
}
```

---

## API Response Interfaces

These are the shapes returned to API clients — **not** raw DynamoDB records.
CloudFront-signed URLs (`imageUrl`, `thumbnailUrl`) are attached here at response time.

```typescript
// Returned by GET /artworks/{pieceId}/detail
interface ArtPieceDetailResponse {
  pieceId: string;
  authorId: string;
  title: string;
  description?: string;
  visibility: 'PUBLIC' | 'PRIVATE';
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  accessible: boolean;           // true if viewer can see the image
  imageUrl?: string;             // CloudFront signed URL — only when accessible=true
  thumbnailUrl?: string;         // CloudFront signed URL — only when accessible=true
  viewCount: number;
  commentCount: number;
  reactionCounts: Record<ReactionType, number>;
  viewerReaction?: ReactionType; // authenticated viewer's current reaction
  tags: string[];
  category?: string;
  commentsEnabled: boolean;
  notificationsSent: number;
  publishedAt?: string;
  createdAt: string;
  author: AuthorProfileSummary;
  relatedPieces: ArtPieceSummary[];
}

// Used in lists and cards
interface ArtPieceSummary {
  pieceId: string;
  authorId: string;
  title: string;
  thumbnailUrl?: string;    // only when accessible=true
  accessible: boolean;
  visibility: 'PUBLIC' | 'PRIVATE';
  reactionCounts: Record<ReactionType, number>;
  publishedAt?: string;
}

interface AuthorProfileSummary {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  connectChargesEnabled: boolean;
  subscriberCount: number;
}

// Access control result (from checkArtPieceAccess())
type AccessDeniedReason =
  | 'PRIVATE_NOT_SUBSCRIBED'   // PRIVATE piece, viewer not subscribed to author
  | 'FREE_TIER_LIMIT'          // PUBLIC piece, viewer hit free-tier limit
  | 'PIECE_NOT_PUBLISHED';     // piece is DRAFT or ARCHIVED

interface AccessCheckResult {
  accessible: boolean;
  deniedReason?: AccessDeniedReason;
}
```

---

## Error Types

```typescript
// Base class — never throw raw Error to API clients
class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) { super(message); }
}

class NotFoundError extends AppError {
  constructor(message = 'Not found') { super(404, 'NOT_FOUND', message); }
}

class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') { super(403, 'FORBIDDEN', message); }
}

class BadRequestError extends AppError {
  constructor(message: string) { super(400, 'BAD_REQUEST', message); }
}

class ConflictError extends AppError {
  constructor(message: string) { super(409, 'CONFLICT', message); }
}

class UnprocessableError extends AppError {
  constructor(message: string) { super(422, 'UNPROCESSABLE', message); }
}
```

---

## Stripe Webhook Event Map

```typescript
// Events handled by subscriptions-webhook-lambda
type HandledStripeEvent =
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'
  | 'customer.subscription.paused'
  | 'customer.subscription.resumed'
  | 'payment_intent.succeeded'      // weekly feature booking confirmation
  | 'payment_intent.payment_failed' // weekly feature booking failure
  | 'invoice.payment_succeeded'     // acknowledge + skip
  | 'account.updated'               // Connect account charges_enabled change
  | 'subscription_schedule.*'       // log + skip
  | 'customer.subscription.trial_will_end'; // log + skip
```
