import { useQuery } from '@tanstack/react-query'
import { getArtwork } from '../services/artworks.service'
import type { Artwork } from '../types/artwork'

export const artworkQueryKey = (artworkId: string) =>
  ['artworks', artworkId] as const

export const useArtwork = (artworkId: string) =>
  useQuery<Artwork>({
    queryKey:  artworkQueryKey(artworkId),
    queryFn:   () => getArtwork(artworkId),
    enabled:   !!artworkId,
    staleTime: 60_000,
  })
