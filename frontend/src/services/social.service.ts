import { api } from './api'
import type { ArtworkComment } from '../types/artwork'
import type { ReactionType } from '../types/artwork'

export interface CommentsResponse {
  items:      ArtworkComment[]
  nextCursor: string | null
}

export const socialService = {
  listComments: (artworkId: string, cursor?: string) => {
    const qs = cursor ? `?cursor=${cursor}&limit=20` : '?limit=20'
    return api.get<CommentsResponse>(`/artworks/${artworkId}/comments${qs}`)
  },

  postComment: (artworkId: string, body: string, parentCommentId?: string) =>
    api.post<ArtworkComment>(`/artworks/${artworkId}/comments`, {
      body,
      parentCommentId: parentCommentId ?? null,
    }),

  deleteComment: (commentId: string) =>
    api.delete<{ commentId: string; deletedAt: string }>(`/comments/${commentId}`),

  upsertReaction: (artworkId: string, reactionType: ReactionType) =>
    api.put<{ artworkId: string; reactionType: ReactionType }>(`/artworks/${artworkId}/reactions`, { reactionType }),

  deleteReaction: (artworkId: string) =>
    api.delete<{ artworkId: string }>(`/artworks/${artworkId}/reactions`),
}
