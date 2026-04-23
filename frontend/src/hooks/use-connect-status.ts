import { useQuery } from '@tanstack/react-query'
import { authorDashboardService } from '../services/author-dashboard.service'

export const connectStatusQueryKey = ['connect', 'status'] as const

export const useConnectStatus = (enabled = true) =>
  useQuery({
    queryKey: connectStatusQueryKey,
    queryFn:  () => authorDashboardService.connectStatus(),
    enabled,
    // Poll every 3 s while onboarding is not yet complete
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data || !data.chargesEnabled) return 3_000
      return false
    },
    staleTime: 0,
    retry: false,
  })
