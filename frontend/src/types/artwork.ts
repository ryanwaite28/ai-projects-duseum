// ── Enums ─────────────────────────────────────────────────────────────────────

export type ArtworkCategory =
  | 'PAINTING'
  | 'ILLUSTRATION'
  | 'DIGITAL'
  | 'PHOTOGRAPHY'
  | 'SCULPTURE'
  | 'MIXED_MEDIA'
  | 'OTHER'

export type ArtworkVisibility = 'PUBLIC' | 'PRIVATE' | 'DRAFT'

export type ReactionType = 'LOVE' | 'WOW' | 'FIRE' | 'INSPIRED'

// ── Artwork list item (from GET /artworks) ────────────────────────────────────

export interface ArtworkListItem {
  artworkId:         string
  title:             string
  authorId:          string
  authorDisplayName: string
  category:          ArtworkCategory
  tags:              string[]
  thumbnailUrl:      string | null
  viewCount:         number
  reactionCounts:    Partial<Record<ReactionType, number>>
  commentCount:      number
  publishedAt:       string
  accessTier:        'PUBLIC' | 'PRIVATE' | 'REQUIRES_PLATFORM_SUB'
  // Author-only fields returned when owner queries their own pieces
  visibility?:       ArtworkVisibility
  status?:           'ACTIVE' | 'ARCHIVED'
  notifiedCount?:    number
  commentsEnabled?:  boolean
  createdAt?:        string
}

// ── Full artwork (from GET /artworks/:id) ─────────────────────────────────────

export interface Artwork {
  artworkId:          string
  title:              string
  description:        string | null
  authorId:           string
  authorDisplayName:  string
  category:           ArtworkCategory
  tags:               string[]
  imageUrl:           string | null
  imageUrlExpiresAt:  string | null
  thumbnailUrl:       string | null
  visibility:         ArtworkVisibility
  viewCount:          number
  reactionCounts:     Partial<Record<ReactionType, number>>
  viewerReaction:     ReactionType | null
  commentCount:       number
  commentsEnabled:    boolean
  publishedAt:        string | null
}

// ── Paginated list response ────────────────────────────────────────────────────

export interface ArtworkListResponse {
  items:        ArtworkListItem[]
  nextCursor:   string | null
  totalVisible: number
}

// ── List filters ──────────────────────────────────────────────────────────────

export interface ArtworkFilters {
  tag?:      string
  category?: ArtworkCategory
  authorId?: string
  sort?:     'newest' | 'trending' | 'mostViewed'
  limit?:    number
  status?:   string
  cursor?:   string
}

// ── Upload intent ─────────────────────────────────────────────────────────────

export interface UploadIntentResponse {
  intentId:  string
  uploadUrl: string
  s3Key:     string
  expiresAt: string
}

// ── Create artwork request ────────────────────────────────────────────────────

export interface CreateArtworkRequest {
  s3Key:           string
  title:           string
  description?:    string
  category:        ArtworkCategory
  tags:            string[]
  visibility:      ArtworkVisibility
  commentsEnabled: boolean
}

// ── Author profile (from GET /authors/:id) ────────────────────────────────────

export interface AuthorProfile {
  userId:                       string
  displayName:                  string
  bio:                          string
  coverPhotoUrl:                string | null
  avatarUrl:                    string | null
  followerCount:                number
  subscriberCount:              number
  authorSubscriptionPriceUsd:   number | null
  connectChargesEnabled:        boolean | null
  recentPieces:                 ArtworkListItem[]
  status:                       'ACTIVE' | 'SUSPENDED'
}

// ── Author collection ─────────────────────────────────────────────────────────

export interface AuthorCollection {
  collectionId:  string
  title:         string
  description:   string | null
  coverPieceUrl: string | null
  pieceCount:    number
  visibility:    'FREE' | 'SUBSCRIBER_ONLY'
}

// ── Comment ───────────────────────────────────────────────────────────────────

export interface ArtworkComment {
  commentId:         string
  artworkId:         string
  authorId:          string
  authorDisplayName: string
  body:              string
  parentCommentId:   string | null
  isPinned:          boolean
  createdAt:         string
}
