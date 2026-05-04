// =============================================================================
// packages/shared/src/types/index.ts
// All Duseum domain types — Section 6.6 + derived from Section 4.7 key design.
// =============================================================================

// ── User & Profiles ──────────────────────────────────────────────────────────

export type UserAccount = {
  userId: string            // Cognito sub (UUID)
  email: string
  systemRole: 'USER' | 'ADMIN'
  emailVerified: boolean
  createdAt: string         // ISO 8601
  lastLoginAt: string
}

export type NotificationPref = 'ALL_NEW_PIECES' | 'PUBLIC_ONLY' | 'NONE'

export type ViewerProfile = {
  userId: string
  profileType: 'VIEWER'
  status: 'ACTIVE' | 'SUSPENDED'
  displayName: string
  createdAt: string
  notificationGlobalOptOut: boolean   // true = suppress ALL new-piece emails
  defaultNotificationPref: NotificationPref // default: ALL_NEW_PIECES
}

export type NotificationPreference = {
  viewerId: string          // userId of the Viewer
  authorId: string          // which Author this preference is for
  pref: NotificationPref    // overrides the Viewer's defaultNotificationPref for this Author
  updatedAt: string         // ISO 8601; set on every write
}

export type AuthorProfile = {
  userId: string
  profileType: 'AUTHOR'
  status: 'PENDING_SETUP' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED'
  displayName: string
  bio: string
  profilePhotoS3Key: string | null
  coverPhotoS3Key: string | null
  stripeConnectAccountId:  string | null
  connectChargesEnabled:   boolean | null   // cached from account.updated webhook (FR-SUB-13)
  authorSubscriptionPriceId: string | null  // Stripe Price ID; null if subscriptions disabled
  authorSubscriptionMonthlyUsd: number | null
  featuredPieceIds: string[]  // up to 3 pinned pieces
  createdAt: string
  totalPiecesCount: number    // denormalized counter
  followerCount: number       // denormalized counter
  subscriberCount: number     // denormalized counter
}

// ── Art Pieces ───────────────────────────────────────────────────────────────

export type ArtCategory =
  | 'PAINTING' | 'DIGITAL' | 'PHOTOGRAPHY' | 'SCULPTURE'
  | 'ILLUSTRATION' | 'MIXED_MEDIA' | 'OTHER'

export type ArtPieceVisibility = 'PUBLIC' | 'PRIVATE' | 'DRAFT'

export type ArtPiece = {
  artworkId: string
  authorId: string
  title: string
  description: string
  tags: string[]              // normalized lowercase
  category: ArtCategory
  visibility: ArtPieceVisibility
  status: 'ACTIVE' | 'ARCHIVED'
  s3Key: string               // S3 object key (UUID-based)
  mimeType: string
  fileSizeBytes: number
  viewCount: number
  commentsEnabled: boolean
  notifiedCount: number       // async counter; updated by notifications-lambda after fan-out
  createdAt: string
  updatedAt: string
  publishedAt: string | null
}

// ── Subscriptions ─────────────────────────────────────────────────────────────

export type Subscription = {
  userId: string              // subscriber
  targetId: 'PLATFORM' | string  // 'PLATFORM' or authorId
  stripeSubscriptionId: string
  stripeCustomerId: string
  // PAUSED added per CLAUDE.md: customer.subscription.paused → PAUSED status
  status: 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'INCOMPLETE' | 'PAUSED'
  currentPeriodEnd: string | null  // ISO 8601; null briefly on creation before first subscription.updated
  createdAt: string
}

// ── Media Upload ──────────────────────────────────────────────────────────────

export type UploadIntent = {
  intentId: string
  uploaderId: string          // userId
  s3Key: string
  mimeType: string
  declaredSizeBytes: number
  status: 'PENDING' | 'CONSUMED' | 'EXPIRED'
  expiresAt: string           // ISO 8601; 10 min from creation
  createdAt: string
}

// ── Social ────────────────────────────────────────────────────────────────────

export type Comment = {
  commentId: string
  artworkId: string
  authorId: string            // userId of commenter
  body: string                // max 1,000 chars
  parentCommentId: string | null
  isPinned: boolean
  isDeleted: boolean          // soft delete by author or admin
  createdAt: string
}

export type Reaction = {
  artworkId: string
  userId: string
  reactionType: 'LOVE' | 'WOW' | 'FIRE' | 'INSPIRED'
  reactedAt: string
}

// ── Social Graph ──────────────────────────────────────────────────────────────

// DynamoDB key: USER#{viewerId} | FOLLOW#AUTHOR#{authorId}
// GSI-FollowersByAuthor: authorId (follow record) | followedAt
export type Follow = {
  viewerId: string
  authorId: string
  followedAt: string          // ISO 8601
}

// ── Collections ───────────────────────────────────────────────────────────────

// DynamoDB key: COLLECTION#{collectionId} | METADATA
export type CollectionVisibility = 'FREE' | 'SUBSCRIBER_ONLY'

export type Collection = {
  collectionId: string
  ownerId: string             // userId
  title: string
  description: string
  visibility: CollectionVisibility  // immutable after creation (FR-COL-03)
  posterS3Key?: string | null  // FR-COL-07: optional poster image
  createdAt: string
  updatedAt: string
}

// DynamoDB key: COLLECTION#{collectionId} | ARTWORK#{order}#{artworkId}
export type CollectionItem = {
  collectionId: string
  artworkId: string
  order: number
  addedAt: string             // ISO 8601
}

// ── Featured Authors ──────────────────────────────────────────────────────────

export type WeeklyFeatureBooking = {
  bookingId: string           // UUID
  authorId: string
  isoWeek: string             // ISO week string: "YYYY-Www" (e.g. "2025-W32")
  weekStartDate: string       // ISO 8601 date of the Monday
  weekEndDate: string         // ISO 8601 date of the Sunday
  featureStatus:
    | 'PENDING_PAYMENT'       // Stripe Payment Intent created; awaiting webhook confirmation
    | 'CONFIRMED'             // payment captured, upcoming
    | 'ACTIVE'                // currently live this week
    | 'ARCHIVED'              // week has passed
    | 'CANCELLED'             // cancelled by Admin
  stripePaymentIntentId: string
  amountPaidUsd: number       // snapshot of fee at booking time
  bookedAt: string            // ISO 8601
  activatedAt: string | null  // set by maintenance-lambda on Monday rotation
  cancelledAt: string | null
  cancelledBy: string | null  // admin userId
  cancellationReason: string | null
}

export type DailyFeatureLog = {
  date: string                // ISO 8601 date: "YYYY-MM-DD"
  authorId: string
  selectedAt: string          // ISO 8601 datetime
  selectionMethod: 'RANDOM' | 'ADMIN_OVERRIDE'
  overriddenBy: string | null // admin userId if ADMIN_OVERRIDE
}
