import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../store/auth.store'
import { subscriptionsService } from '../services/subscriptions.service'

export const subscriptionsQueryKey = ['subscriptions', 'me'] as const

export const useSubscriptions = () => {
  const { user } = useAuthStore()

  const query = useQuery({
    queryKey:  subscriptionsQueryKey,
    queryFn:   () => subscriptionsService.getMySubscriptions(),
    enabled:   !!user,
    staleTime: 30_000,
  })

  const platform            = query.data?.platform ?? null
  const authorSubscriptions = query.data?.authorSubscriptions ?? []

  const hasPlatformSub = platform?.status === 'ACTIVE'

  const hasAuthorSub = (authorId: string) =>
    authorSubscriptions.some(
      (s) => s.targetId === authorId && s.status === 'ACTIVE'
    )

  return {
    ...query,
    platform,
    authorSubscriptions,
    hasPlatformSub,
    hasAuthorSub,
  }
}
