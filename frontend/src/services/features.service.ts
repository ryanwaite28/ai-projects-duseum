import { api } from './api'
import type {
  BookWeeklyResponse,
  DailyFeaturedResponse,
  MyBookingsResponse,
  WeeklyAvailabilityResponse,
  WeeklyFeaturedResponse,
} from '../types/features'

export const featuresService = {
  getDailyFeatured: () =>
    api.get<DailyFeaturedResponse>('/features/daily'),

  getWeeklyFeatured: (week?: string) =>
    api.get<WeeklyFeaturedResponse>(week ? `/features/weekly?week=${week}` : '/features/weekly'),

  getWeeklyAvailability: () =>
    api.get<WeeklyAvailabilityResponse>('/features/weekly/availability'),

  bookWeekly: (isoWeek: string) =>
    api.post<BookWeeklyResponse>('/features/weekly/book', { isoWeek }),

  getMyBookings: () =>
    api.get<MyBookingsResponse>('/features/weekly/my-bookings'),
}
