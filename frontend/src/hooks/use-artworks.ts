import { useInfiniteQuery } from '@tanstack/react-query'
import type { InfiniteData } from '@tanstack/react-query'
import { listArtworks } from '../services/artworks.service'
import type { ArtworkFilters, ArtworkListResponse } from '../types/artwork'

export const artworksQueryKey = (filters: ArtworkFilters) =>
  ['artworks', 'list', filters] as const

export const useArtworks = (filters: ArtworkFilters = {}) =>
  useInfiniteQuery<ArtworkListResponse, Error, InfiniteData<ArtworkListResponse>, ReturnType<typeof artworksQueryKey>, string | null>({
    queryKey:        artworksQueryKey(filters),
    queryFn:         ({ pageParam }) => listArtworks({ ...filters, cursor: pageParam ?? undefined }),
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? null,
    staleTime:        60_000,
  })
