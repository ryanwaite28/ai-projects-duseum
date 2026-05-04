// ── Daily Featured Author ─────────────────────────────────────────────────────

export interface SpotlightPiece {
  artworkId:    string
  title:        string
  thumbnailUrl: string | null
  category:     string
}

export interface DailyFeaturedAuthor {
  authorId:                      string
  displayName:                   string
  bio:                           string
  coverPhotoUrl:                 string | null
  followerCount:                 number
  subscriberCount:               number
  authorSubscriptionMonthlyUsd:  number | null
}

export interface DailyFeaturedResponse {
  date:             string          // 'YYYY-MM-DD'
  author:           DailyFeaturedAuthor | null
  spotlightPieces:  SpotlightPiece[]
  selectionMethod:  'RANDOM' | 'ADMIN_OVERRIDE'
}

// ── Weekly Featured Authors ───────────────────────────────────────────────────

export interface WeeklyFeaturedPiece {
  artworkId:    string
  title:        string
  thumbnailUrl: string | null
}

export interface WeeklyFeaturedAuthor {
  authorId:      string
  displayName:   string
  avatarUrl:     string | null
  coverPhotoUrl: string | null
  recentPieces:  WeeklyFeaturedPiece[]
}

export interface WeeklyFeaturedResponse {
  isoWeek:         string
  weekStartDate:   string
  weekEndDate:     string
  slotsFilled:     number
  slotsTotal:      number
  featuredAuthors: WeeklyFeaturedAuthor[]
}

// ── Availability Calendar ─────────────────────────────────────────────────────

export interface WeeklyAvailabilityWeek {
  isoWeek:        string
  weekStartDate:  string
  weekEndDate:    string
  slotsTotal:     number
  slotsAvailable: number
  isAvailable:    boolean
}

export interface WeeklyAvailabilityResponse {
  weeks:   WeeklyAvailabilityWeek[]
  feeUsd:  number
}

// ── Book Weekly ───────────────────────────────────────────────────────────────

export interface BookWeeklyResponse {
  bookingId:          string
  isoWeek:            string
  weekStartDate:      string
  weekEndDate:        string
  amountUsd:          number
  stripeClientSecret: string
  status:             'PENDING_PAYMENT'
}

// ── My Bookings ───────────────────────────────────────────────────────────────

export type BookingStatus = 'PENDING_PAYMENT' | 'CONFIRMED' | 'ACTIVE' | 'ARCHIVED' | 'CANCELLED'

export interface MyBooking {
  bookingId:     string
  isoWeek:       string
  weekStartDate: string
  weekEndDate:   string
  featureStatus: BookingStatus
  amountPaidUsd: number
  bookedAt:      string
}

export interface MyBookingsResponse {
  items:            MyBooking[]
  nextEligibleWeek: string | null
}

// ── Admin bookings list ───────────────────────────────────────────────────────

export interface AdminBooking {
  bookingId:     string
  authorId:      string
  isoWeek:       string
  weekStartDate: string
  weekEndDate:   string
  featureStatus: BookingStatus
  amountPaidUsd: number
  bookedAt:      string
  cancelledAt:   string | null
  cancelledBy:   string | null
}

export interface AdminBookingsResponse {
  bookings:   AdminBooking[]
  nextCursor: string | null
}

export interface CancelBookingResponse {
  bookingId:     string
  featureStatus: 'CANCELLED'
  refundId:      string
  cancelledAt:   string
}

export interface OverrideDailyResponse {
  date:              string
  authorId:          string
  overriddenBy:      string
  previousAuthorId:  string | null
}
