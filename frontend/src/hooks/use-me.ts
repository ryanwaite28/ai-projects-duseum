import { useQuery } from '@tanstack/react-query'
import { api } from '../services/api'
import { useAuthStore } from '../store/auth.store'

interface ViewerProfile {
  userId: string
  displayName?: string
  notificationPrefs?: Record<string, unknown>
}

interface AuthorProfile {
  userId: string
  displayName: string
  bio: string
  status: 'ACTIVE' | 'SUSPENDED'
  followerCount: number
  subscriberCount: number
  featuredPieceIds: string[]
  stripeConnectAccountId: string | null
  authorSubscriptionPriceId: string | null
  authorSubscriptionPriceUsd?: number
  authorSubscriptionMonthlyUsd: number | null
}

interface MeResponse {
  account:       { userId: string; email: string; systemRole: 'USER' | 'ADMIN' }
  viewerProfile: ViewerProfile | null
  authorProfile: AuthorProfile | null
}

export const useMeQueryKey = ['users', 'me'] as const

export const useMe = () => {
  const { user } = useAuthStore()

  return useQuery<MeResponse>({
    queryKey: useMeQueryKey,
    queryFn:  () => api.get<MeResponse>('/users/me'),
    enabled:  !!user,
    staleTime: 5 * 60 * 1000,
  })
}
