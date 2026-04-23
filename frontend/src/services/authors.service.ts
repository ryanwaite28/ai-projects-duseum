import { api } from './api'
import type { AuthorProfile, AuthorCollection } from '../types/artwork'

export const getAuthor = (authorId: string): Promise<AuthorProfile> =>
  api.get<AuthorProfile>(`/authors/${authorId}`)

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

export const getAuthorCollections = (authorId: string): Promise<{ items: AuthorCollection[] }> =>
  api.get(`/authors/${authorId}/collections`)
