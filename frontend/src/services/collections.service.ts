import { api } from './api'
import type { AuthorCollection, BrowseCollection, CollectionDetail } from '../types/artwork'

export interface CollectionBody {
  title:        string
  description?: string
  visibility:   'FREE' | 'SUBSCRIBER_ONLY'
  posterS3Key?: string | null
}

export interface CollectionPiece {
  artworkId:    string
  displayOrder: number
}

export interface CollectionPiecesResponse {
  pieces: CollectionPiece[]
}

export const collectionsService = {
  getById: (collectionId: string) =>
    api.get<CollectionDetail>(`/collections/${collectionId}`),

  browse: (params: { limit?: number; cursor?: string } = {}) => {
    const qs = new URLSearchParams({ sort: 'newest' })
    if (params.limit)  qs.set('limit',  String(params.limit))
    if (params.cursor) qs.set('cursor', params.cursor)
    return api.get<{ items: BrowseCollection[]; cursor?: string }>(`/collections?${qs}`)
  },

  listMy: (authorId: string) =>
    api.get<{ items: AuthorCollection[] }>(`/authors/${authorId}/collections`),

  create: (body: CollectionBody) =>
    api.post<AuthorCollection>('/collections', body),

  update: (collectionId: string, body: Partial<CollectionBody>) =>
    api.put<AuthorCollection>(`/collections/${collectionId}`, body),

  delete: (collectionId: string) =>
    api.delete<void>(`/collections/${collectionId}`),

  listPieces: (collectionId: string) =>
    api.get<CollectionPiecesResponse>(`/collections/${collectionId}/pieces`),

  addPiece: (collectionId: string, artworkId: string, displayOrder: number) =>
    api.post<void>(`/collections/${collectionId}/pieces`, { artworkId, displayOrder }),

  removePiece: (collectionId: string, artworkId: string) =>
    api.delete<void>(`/collections/${collectionId}/pieces/${artworkId}`),
}
