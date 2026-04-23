import { api } from './api'
import type { AuthorCollection } from '../types/artwork'

export interface CollectionBody {
  title:        string
  description?: string
  visibility:   'PUBLIC' | 'PRIVATE'
}

export interface CollectionPiece {
  artworkId:    string
  displayOrder: number
}

export interface CollectionPiecesResponse {
  pieces: CollectionPiece[]
}

export const collectionsService = {
  listMy: (authorId: string) =>
    api.get<{ collections: AuthorCollection[] }>(`/collections?authorId=${authorId}`),

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
