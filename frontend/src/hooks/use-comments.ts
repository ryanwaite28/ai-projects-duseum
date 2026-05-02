import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { socialService } from '../services/social.service'
import type { ArtworkComment } from '../types/artwork'

export const commentsQueryKey = (artworkId: string) =>
  ['comments', artworkId] as const

export const useComments = (artworkId: string) =>
  useInfiniteQuery({
    queryKey:          commentsQueryKey(artworkId),
    queryFn:           ({ pageParam }) =>
      socialService.listComments(artworkId, pageParam as string | undefined),
    initialPageParam:  undefined as string | undefined,
    getNextPageParam:  (last) => last.nextCursor ?? undefined,
    enabled:           !!artworkId,
    staleTime:         30_000,
  })

export const usePostComment = (artworkId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ body, parentCommentId }: { body: string; parentCommentId?: string }) =>
      socialService.postComment(artworkId, body, parentCommentId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: commentsQueryKey(artworkId) })
    },
  })
}

export const useDeleteComment = (artworkId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (commentId: string) => socialService.deleteComment(commentId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: commentsQueryKey(artworkId) })
    },
  })
}

export const useAllComments = (artworkId: string): ArtworkComment[] => {
  const { data } = useComments(artworkId)
  return data?.pages.flatMap((p) => p.items) ?? []
}

export const usePinComment = (artworkId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (commentId: string) => socialService.pinComment(artworkId, commentId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: commentsQueryKey(artworkId) })
    },
  })
}
