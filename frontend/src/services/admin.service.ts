import { api } from './api'
import type {
  AdminBookingsResponse,
  CancelBookingResponse,
  OverrideDailyResponse,
} from '../types/features'

// ── Shared filter helpers ──────────────────────────────────────────────────────

const qs = (params: Record<string, string | number | boolean | undefined>) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') p.set(k, String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AdminBookingFilters {
  [key: string]: string | number | undefined
  week?:   string
  status?: string
  limit?:  number
  cursor?: string
}

export interface AdminDashboard {
  totalUsers:          number
  activePlatformSubs:  number
  activeAuthorSubs:    number
  platformMrrUsd:      number
  newSignups7d:        number | null
  newSignups30d:       number | null
  dlqDepths:           { stripeWebhook: number; notifications: number }
  upcomingFeatureBookings: Array<{
    isoWeek:        string
    confirmedCount: number
    activeCount:    number
  }>
}

export interface AdminUser {
  userId:        string
  email:         string
  enabled:       boolean
  userStatus:    string
  createdAt:     string
  viewerStatus?: string
}

export interface AdminUsersResponse {
  users:      AdminUser[]
  nextCursor: string | null
}

export interface AdminUserFilters {
  [key: string]: string | number | undefined
  email?:  string
  status?: string
  limit?:  number
  cursor?: string
}

export interface AdminArtwork {
  artworkId:   string
  title:       string
  authorId:    string
  status:      string
  s3Key:       string
  createdAt:   string
  thumbnailUrl?: string
}

export interface AdminArtworksResponse {
  artworks:   AdminArtwork[]
  nextCursor: string | null
}

export interface AdminArtworkFilters {
  status?: string
  limit?:  number
  cursor?: string
}

export interface AdminConfigBody {
  freeTierLimit?:            number
  platformSubPriceId?:       string
  platformCutPercent?:       number
  weeklyFeatureFeeUsd?:      number
  weeklyFeatureSlotCount?:   number
  weeklyFeatureAdvanceWeeks?: number
}

export interface AdminConfigResponse {
  updated: string[]
}

// ── Service ───────────────────────────────────────────────────────────────────

export const adminService = {
  // Dashboard
  getDashboard: () =>
    api.get<AdminDashboard>('/admin/dashboard'),

  // Users
  listUsers: (filters: AdminUserFilters = {}) =>
    api.get<AdminUsersResponse>(`/admin/users${qs(filters)}`),

  suspendUser: (userId: string) =>
    api.put<{ userId: string; suspended: boolean; suspendedAt: string }>(
      `/admin/users/${userId}/suspend`,
      {}
    ),

  reinstateUser: (userId: string) =>
    api.put<{ userId: string; reinstated: boolean; reinstatedAt: string }>(
      `/admin/users/${userId}/reinstate`,
      {}
    ),

  // Content moderation
  removeArtwork: (artworkId: string) =>
    api.delete<{ artworkId: string; status: string; removedAt: string }>(
      `/admin/artworks/${artworkId}`
    ),

  // Config
  updateConfig: (body: AdminConfigBody) =>
    api.put<AdminConfigResponse>('/admin/config', body),

  // Features (pre-existing)
  overrideDailyFeature: (authorId: string) =>
    api.put<OverrideDailyResponse>('/admin/features/daily/override', { authorId }),

  getAdminWeeklyBookings: (filters: AdminBookingFilters = {}) =>
    api.get<AdminBookingsResponse>(`/admin/features/weekly${qs(filters)}`),

  cancelBooking: (bookingId: string, reason: string) =>
    api.deleteWithBody<CancelBookingResponse>(
      `/admin/features/weekly/bookings/${bookingId}`,
      { reason }
    ),
}
