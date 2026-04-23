import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { followsService } from '../services/follows.service'
import type { NotificationPref } from '../services/follows.service'
import { useAuthStore } from '../store/auth.store'

export const notifPrefsQueryKey = ['notification-preferences'] as const

export const useNotificationPreferences = () => {
  const { user } = useAuthStore()
  return useQuery({
    queryKey:  notifPrefsQueryKey,
    queryFn:   () => followsService.getNotificationPreferences(),
    enabled:   !!user,
    staleTime: 60_000,
  })
}

export const useFollowAuthor = (authorId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => followsService.follow(authorId),
    onSuccess:  () => {
      void qc.invalidateQueries({ queryKey: notifPrefsQueryKey })
    },
  })
}

export const useUnfollowAuthor = (authorId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => followsService.unfollow(authorId),
    onSuccess:  () => {
      void qc.invalidateQueries({ queryKey: notifPrefsQueryKey })
    },
  })
}

export const useUpdateNotifPref = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: followsService.updateNotificationPreferences,
    onSuccess:  (data) => {
      qc.setQueryData(notifPrefsQueryKey, data)
    },
  })
}

export const useAuthorNotifPref = (authorId: string): NotificationPref | null => {
  const { data } = useNotificationPreferences()
  return data?.perAuthorOverrides.find((o) => o.authorId === authorId)?.pref ?? null
}
