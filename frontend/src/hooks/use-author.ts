import { useQuery, useInfiniteQuery } from '@tanstack/react-query'
import type { InfiniteData } from '@tanstack/react-query'
import { getAuthor, getAuthorCollections, listAuthors } from '../services/authors.service'
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

type AuthorSort = 'newest' | 'subscriberCount'
type AuthorListPage = { items: AuthorProfile[]; nextCursor: string | null }

export const authorsListQueryKey = (sort: AuthorSort) =>
  ['authors', 'list', sort] as const

export const useAuthors = (sort: AuthorSort = 'newest') =>
  useInfiniteQuery<AuthorListPage, Error, InfiniteData<AuthorListPage>, ReturnType<typeof authorsListQueryKey>, string | null>({
    queryKey:         authorsListQueryKey(sort),
    queryFn:          ({ pageParam }) => listAuthors({ sort, limit: 18, cursor: pageParam ?? undefined }),
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? null,
    staleTime:        2 * 60_000,
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
