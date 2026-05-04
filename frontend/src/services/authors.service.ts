import { api } from './api'
import type { AuthorProfile, ArtworkListItem, AuthorCollection } from '../types/artwork'

type GalleryItem = Pick<ArtworkListItem, 'artworkId' | 'title' | 'category' | 'tags' | 'thumbnailUrl' | 'viewCount' | 'publishedAt'>

type GetAuthorApiResponse = {
  profile: {
    authorId:                     string
    displayName:                  string
    bio:                          string
    profilePhotoUrl:              string | null
    coverPhotoUrl:                string | null
    followerCount:                number
    subscriberCount:              number
    totalPiecesCount:             number
    authorSubscriptionMonthlyUsd: number | null
    connectChargesEnabled:        boolean | null
    createdAt:                    string
  }
  gallery: {
    items:      GalleryItem[]
    nextCursor: string | null
  }
}

export const getAuthor = (authorId: string): Promise<AuthorProfile> =>
  api.get<GetAuthorApiResponse>(`/authors/${authorId}`).then(({ profile, gallery }) => ({
    userId:                     profile.authorId,
    displayName:                profile.displayName,
    bio:                        profile.bio,
    coverPhotoUrl:              profile.coverPhotoUrl,
    avatarUrl:                  profile.profilePhotoUrl,
    followerCount:              profile.followerCount,
    subscriberCount:            profile.subscriberCount,
    authorSubscriptionPriceUsd: profile.authorSubscriptionMonthlyUsd,
    connectChargesEnabled:      profile.connectChargesEnabled,
    recentPieces:               gallery.items.map(item => ({
      ...item,
      authorId:          profile.authorId,
      authorDisplayName: profile.displayName,
      accessTier:        'PUBLIC' as const,
      reactionCounts:    {},
      commentCount:      0,
    })),
    status:                     'ACTIVE' as const,
  }))

export const listAuthors = (opts?: {
  sort?:   'subscriberCount' | 'newest'
  limit?:  number
  cursor?: string
}): Promise<{ items: AuthorProfile[]; nextCursor: string | null }> => {
  const params = new URLSearchParams()
  if (opts?.sort)   params.set('sort',   opts.sort)
  if (opts?.limit)  params.set('limit',  String(opts.limit))
  if (opts?.cursor) params.set('cursor', opts.cursor)
  const qs = params.toString()
  return api.get(`/authors${qs ? `?${qs}` : ''}`)
}

export const updateAuthorProfile = (patch: Partial<{
  displayName:                  string
  bio:                          string
  profilePhotoS3Key:            string | null
  coverPhotoS3Key:              string | null
  featuredPieceIds:             string[]
  authorSubscriptionMonthlyUsd: number | null
}>): Promise<unknown> =>
  api.put('/users/me/author', patch)

export const getAuthorCollections = (authorId: string): Promise<{ items: AuthorCollection[] }> =>
  api.get(`/authors/${authorId}/collections`)
