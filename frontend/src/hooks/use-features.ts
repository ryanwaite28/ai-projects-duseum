import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { featuresService } from '../services/features.service'
import { useAuthStore } from '../store/auth.store'
import type { BookWeeklyResponse } from '../types/features'

export const dailyFeaturedQueryKey  = ['features', 'daily']   as const
export const weeklyFeaturedQueryKey = (week?: string) => ['features', 'weekly', week ?? 'current'] as const
export const weeklyAvailabilityQueryKey = ['features', 'weekly', 'availability'] as const
export const myBookingsQueryKey     = ['features', 'my-bookings']  as const

export const useDailyFeatured = () =>
  useQuery({
    queryKey: dailyFeaturedQueryKey,
    queryFn:  () => featuresService.getDailyFeatured(),
    staleTime: 60 * 60 * 1000, // 1 hour — rotates daily
  })

export const useWeeklyFeatured = (week?: string) =>
  useQuery({
    queryKey: weeklyFeaturedQueryKey(week),
    queryFn:  () => featuresService.getWeeklyFeatured(week),
    staleTime: 30 * 60 * 1000,
  })

export const useWeeklyAvailability = () =>
  useQuery({
    queryKey: weeklyAvailabilityQueryKey,
    queryFn:  () => featuresService.getWeeklyAvailability(),
    staleTime: 5 * 60 * 1000, // 5 min — slot counts change as bookings arrive
  })

export const useMyBookings = () => {
  const { user } = useAuthStore()
  return useQuery({
    queryKey: myBookingsQueryKey,
    queryFn:  () => featuresService.getMyBookings(),
    enabled:  !!user,
    staleTime: 2 * 60 * 1000,
  })
}

export const useBookWeekly = () => {
  const queryClient = useQueryClient()
  return useMutation<BookWeeklyResponse, Error, string>({
    mutationFn: (isoWeek: string) => featuresService.bookWeekly(isoWeek),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: weeklyAvailabilityQueryKey })
    },
  })
}
