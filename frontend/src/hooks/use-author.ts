import { useQuery } from '@tanstack/react-query'
import { getAuthor, getAuthorCollections } from '../services/authors.service'
import type { AuthorProfile, AuthorCollection } from '../types/artwork'

export const authorQueryKey = (authorId: string) =>
  ['authors', authorId] as const

export const useAuthor = (authorId: string) =>
  useQuery<AuthorProfile>({
    queryKey:  authorQueryKey(authorId),
    queryFn:   () => getAuthor(authorId),
    enabled:   !!authorId,
    staleTime: 2 * 60_000,
  })

export const authorCollectionsQueryKey = (authorId: string) =>
  ['authors', authorId, 'collections'] as const

export const useAuthorCollections = (authorId: string) =>
  useQuery<{ items: AuthorCollection[] }>({
    queryKey:  authorCollectionsQueryKey(authorId),
    queryFn:   () => getAuthorCollections(authorId),
    enabled:   !!authorId,
    staleTime: 2 * 60_000,
  })
