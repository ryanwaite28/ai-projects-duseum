import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { EyebrowLabel } from '../ui/EyebrowLabel'
import { GoldDivider } from '../ui/GoldDivider'
import { BookingCalendar } from './booking-calendar'
import { StripePaymentModal } from './stripe-payment-modal'
import { useWeeklyAvailability, useMyBookings, useBookWeekly } from '../../hooks/use-features'
import type { BookWeeklyResponse, BookingStatus } from '../../types/features'
import { ApiError } from '../../services/api'

type FlowStep = 'idle' | 'paying' | 'confirmed'

function currentIsoWeek(): string {
  const now       = new Date()
  const thursday  = new Date(now)
  thursday.setUTCDate(now.getUTCDate() + (4 - (now.getUTCDay() || 7)))
  const year      = thursday.getUTCFullYear()
  const startOfYear = new Date(Date.UTC(year, 0, 1))
  const week      = Math.ceil(((thursday.getTime() - startOfYear.getTime()) / 86_400_000 + startOfYear.getUTCDay() + 1) / 7)
  return `${year}-W${String(week).padStart(2, '0')}`
}

const statusBadge: Record<BookingStatus, { label: string; cls: string }> = {
  PENDING_PAYMENT: { label: 'Pending',   cls: 'text-gold     bg-gold/10'        },
  CONFIRMED:       { label: 'Confirmed', cls: 'text-[#5a9e6e] bg-[#5a9e6e]/10'  },
  ACTIVE:          { label: 'Active',    cls: 'text-[#5a9e6e] bg-[#5a9e6e]/12'  },
  ARCHIVED:        { label: 'Archived',  cls: 'text-stone-light bg-white/[0.04]' },
  CANCELLED:       { label: 'Cancelled', cls: 'text-[#c0544a] bg-[#c0544a]/10'  },
}

const formatDate = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  })

export const WeeklyFeatureSection = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const [step,          setStep]        = useState<FlowStep>('idle')
  const [selectedWeek,  setSelectedWeek] = useState<string | null>(null)
  const [pendingBooking, setPendingBooking] = useState<BookWeeklyResponse | null>(null)
  const [bookError,     setBookError]   = useState<string | null>(null)

  const { data: availability, isLoading: availLoading } = useWeeklyAvailability()
  const { data: myBookings,   isLoading: histLoading }  = useMyBookings()
  const bookMutation = useBookWeekly()

  // Detect return from Stripe redirect
  useEffect(() => {
    const feature   = searchParams.get('feature')
    const bookingId = searchParams.get('bookingId')
    if (feature === 'booking-success' && bookingId) {
      setStep('confirmed')
      const next = new URLSearchParams(searchParams)
      next.delete('feature')
      next.delete('bookingId')
      next.delete('week')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const handleBook = async () => {
    if (!selectedWeek) return
    setBookError(null)
    try {
      const result = await bookMutation.mutateAsync(selectedWeek)
      setPendingBooking(result)
      setStep('paying')
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setBookError(err.message)
      } else {
        setBookError('Something went wrong. Please try again.')
      }
    }
  }

  const handleCancelPayment = () => {
    setStep('idle')
    setPendingBooking(null)
    setSelectedWeek(null)
  }

  const feeUsd = availability?.feeUsd ?? 25

  // ── Confirmed state ─────────────────────────────────────────────────────────
  if (step === 'confirmed') {
    return (
      <div className="bg-ink-soft border border-gold/10 p-8">
        <EyebrowLabel>Weekly Feature</EyebrowLabel>
        <h2 className="font-display text-xl text-warm-white font-normal mb-2">
          Booking <em className="italic text-gold-light">confirmed</em>
        </h2>
        <GoldDivider />
        <p className="text-stone-light text-sm font-body font-light mt-4">
          Your slot is reserved. Payment will be confirmed once processed by our system.
          You'll appear on the Weekly Featured section on your selected week.
        </p>
        <button
          onClick={() => setStep('idle')}
          className="mt-6 text-[0.78rem] font-medium tracking-[0.1em] uppercase text-gold hover:text-gold-light transition-colors"
        >
          Book another week →
        </button>
      </div>
    )
  }

  // ── Paying state ────────────────────────────────────────────────────────────
  if (step === 'paying' && pendingBooking) {
    return (
      <div className="bg-ink-soft border border-gold/10 p-8">
        <EyebrowLabel>Weekly Feature</EyebrowLabel>
        <h2 className="font-display text-xl text-warm-white font-normal mb-2">
          Complete <em className="italic text-gold-light">payment</em>
        </h2>
        <GoldDivider />
        <div className="mt-6">
          <StripePaymentModal
            clientSecret={pendingBooking.stripeClientSecret}
            bookingId={pendingBooking.bookingId}
            isoWeek={pendingBooking.isoWeek}
            amountUsd={pendingBooking.amountUsd}
            onCancel={handleCancelPayment}
          />
        </div>
      </div>
    )
  }

  // ── Idle state: calendar + history ─────────────────────────────────────────
  return (
    <div className="bg-ink-soft border border-gold/10 p-8 flex flex-col gap-10">
      {/* Availability calendar */}
      <div>
        <div className="mb-6">
          <p className="text-[0.68rem] font-medium tracking-[0.2em] uppercase text-gold mb-1">
            Weekly Feature Booking
          </p>
          <h2 className="font-display text-xl text-warm-white font-normal">
            Book a Featured Slot
          </h2>
          <p className="text-stone-light text-sm mt-2 font-body font-light">
            Get featured on the homepage for an entire week. One slot per 3-month period.
            Fee: <span className="text-parchment-dim font-medium">${feeUsd}</span> (one-time, non-refundable).
          </p>
        </div>

        {availLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="animate-pulse h-24 bg-ink border border-gold/8 rounded-sm" />
            ))}
          </div>
        ) : availability ? (
          <BookingCalendar
            weeks={availability.weeks}
            selectedWeek={selectedWeek}
            onSelect={setSelectedWeek}
            disabledWeeks={new Set([currentIsoWeek()])}
          />
        ) : (
          <p className="text-stone-light text-sm font-body">
            Unable to load availability. Please refresh.
          </p>
        )}

        {bookError && (
          <p className="mt-4 text-[0.82rem] text-[#c0544a] font-body">{bookError}</p>
        )}

        <div className="mt-6">
          <button
            onClick={handleBook}
            disabled={!selectedWeek || bookMutation.isPending}
            className="bg-gold hover:bg-gold-light text-ink font-body text-sm font-medium uppercase tracking-[0.04em] px-8 py-[0.9rem] rounded-sm transition-colors duration-150 hover:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0"
          >
            {bookMutation.isPending
              ? 'Creating booking…'
              : selectedWeek
                ? `Book ${selectedWeek} for $${feeUsd}`
                : 'Select a week above'}
          </button>
        </div>
      </div>

      {/* Booking history */}
      <div>
        <div className="w-full h-px bg-gold/10 mb-8" />
        <p className="text-[0.68rem] font-medium tracking-[0.2em] uppercase text-gold mb-4">
          Booking History
        </p>

        {histLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="animate-pulse h-12 bg-ink border border-gold/8 rounded-sm" />
            ))}
          </div>
        ) : myBookings && myBookings.items.length > 0 ? (
          <>
            {myBookings.nextEligibleWeek && (
              <p className="text-[0.82rem] text-stone-light font-body mb-4">
                Next eligible week:{' '}
                <span className="text-parchment-dim font-medium">{myBookings.nextEligibleWeek}</span>
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[0.82rem]">
                <thead>
                  <tr className="border-b border-gold/10">
                    <th className="pb-3 text-[0.68rem] font-medium tracking-[0.12em] uppercase text-stone-light font-body pr-6">Week</th>
                    <th className="pb-3 text-[0.68rem] font-medium tracking-[0.12em] uppercase text-stone-light font-body pr-6">Dates</th>
                    <th className="pb-3 text-[0.68rem] font-medium tracking-[0.12em] uppercase text-stone-light font-body pr-6">Status</th>
                    <th className="pb-3 text-[0.68rem] font-medium tracking-[0.12em] uppercase text-stone-light font-body">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {myBookings.items.map((booking) => {
                    const badge = statusBadge[booking.featureStatus]
                    return (
                      <tr key={booking.bookingId} className="border-b border-gold/[0.06]">
                        <td className="py-3 pr-6 font-mono text-parchment-dim">{booking.isoWeek}</td>
                        <td className="py-3 pr-6 font-light text-stone-light">
                          {formatDate(booking.weekStartDate)} – {formatDate(booking.weekEndDate)}
                        </td>
                        <td className="py-3 pr-6">
                          <span className={`text-[0.68rem] font-medium tracking-[0.1em] uppercase px-2 py-1 rounded-sm ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="py-3 font-light text-stone-light">${booking.amountPaidUsd}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-[0.82rem] text-stone-light font-body">No bookings yet.</p>
        )}
      </div>
    </div>
  )
}
