import { useMutation, useQueryClient } from '@tanstack/react-query'
import { socialService } from '../services/social.service'
import type { ReactionType } from '../types/artwork'
import type { Artwork } from '../types/artwork'
import { artworkQueryKey } from './use-artwork'

export const useUpsertReaction = (artworkId: string) => {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (reactionType: ReactionType) =>
      socialService.upsertReaction(artworkId, reactionType),

    onMutate: async (reactionType) => {
      await qc.cancelQueries({ queryKey: artworkQueryKey(artworkId) })
      const prev = qc.getQueryData<Artwork>(artworkQueryKey(artworkId))

      if (prev) {
        const prevCounts = { ...prev.reactionCounts }
        // Remove old reaction count if viewer had one
        const updated: Partial<Record<ReactionType, number>> = { ...prevCounts }
        updated[reactionType] = (updated[reactionType] ?? 0) + 1
        qc.setQueryData<Artwork>(artworkQueryKey(artworkId), { ...prev, reactionCounts: updated })
      }

      return { prev }
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(artworkQueryKey(artworkId), ctx.prev)
    },

    onSettled: () => {
      void qc.invalidateQueries({ queryKey: artworkQueryKey(artworkId) })
    },
  })
}

export const useDeleteReaction = (artworkId: string) => {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: () => socialService.deleteReaction(artworkId),

    onMutate: async () => {
      await qc.cancelQueries({ queryKey: artworkQueryKey(artworkId) })
      const prev = qc.getQueryData<Artwork>(artworkQueryKey(artworkId))

      if (prev?.viewerReaction) {
        const updated = { ...prev.reactionCounts }
        const cur = updated[prev.viewerReaction] ?? 0
        if (cur > 1) updated[prev.viewerReaction] = cur - 1
        else delete updated[prev.viewerReaction]
        qc.setQueryData<Artwork>(artworkQueryKey(artworkId), { ...prev, reactionCounts: updated, viewerReaction: null })
      }

      return { prev }
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(artworkQueryKey(artworkId), ctx.prev)
    },

    onSettled: () => {
      void qc.invalidateQueries({ queryKey: artworkQueryKey(artworkId) })
    },
  })
}
