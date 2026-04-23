import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { EyebrowLabel } from '../../components/ui/EyebrowLabel'
import { GoldDivider } from '../../components/ui/GoldDivider'
import { PageLayout } from '../../components/layout/PageLayout'
import { ProtectedRoute } from '../../components/layout/ProtectedRoute'
import { useMe } from '../../hooks/use-me'
import { adminService } from '../../services/admin.service'
import type { AdminBooking, BookingStatus } from '../../types/features'

// ── Helpers ───────────────────────────────────────────────────────────────────

const statusBadge: Record<BookingStatus, { label: string; cls: string }> = {
  PENDING_PAYMENT: { label: 'Pending',   cls: 'text-gold bg-gold/10'             },
  CONFIRMED:       { label: 'Confirmed', cls: 'text-[#5a9e6e] bg-[#5a9e6e]/10'  },
  ACTIVE:          { label: 'Active',    cls: 'text-[#5a9e6e] bg-[#5a9e6e]/12'  },
  ARCHIVED:        { label: 'Archived',  cls: 'text-stone-light bg-white/[0.04]' },
  CANCELLED:       { label: 'Cancelled', cls: 'text-[#c0544a] bg-[#c0544a]/10'  },
}

const formatDate = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  })

// ── Daily Override Section ────────────────────────────────────────────────────

const DailyOverrideSection = () => {
  const [authorId, setAuthorId] = useState('')
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg,   setErrorMsg]   = useState<string | null>(null)

  const override = useMutation({
    mutationFn: (id: string) => adminService.overrideDailyFeature(id),
    onSuccess: (data) => {
      setSuccessMsg(
        `Override applied — ${data.authorId} is now today's featured author.`
      )
      setErrorMsg(null)
      setAuthorId('')
    },
    onError: () => {
      setErrorMsg('Override failed. Check the author ID and try again.')
      setSuccessMsg(null)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!authorId.trim()) return
    override.mutate(authorId.trim())
  }

  return (
    <div className="bg-ink-soft border border-gold/10 p-8">
      <EyebrowLabel>Admin</EyebrowLabel>
      <h2 className="font-display text-xl text-warm-white font-normal mb-2">
        Daily Featured <em className="italic text-gold-light">Override</em>
      </h2>
      <GoldDivider />

      <p className="text-stone-light text-sm font-body font-light mt-4 mb-6">
        Manually set today's Daily Featured Author. Enter the authorId — the override
        takes effect immediately and is logged.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-sm">
        <div>
          <label className="block text-[0.68rem] font-medium tracking-[0.14em] uppercase text-gold mb-2">
            Author ID
          </label>
          <input
            type="text"
            value={authorId}
            onChange={(e) => setAuthorId(e.target.value)}
            placeholder="usr_…"
            className="w-full bg-ink border border-gold/20 focus:border-gold/50 text-parchment-dim placeholder:text-stone-light/40 font-body text-sm px-4 py-3 rounded-sm outline-none transition-colors"
          />
        </div>

        {successMsg && (
          <p className="text-[0.82rem] text-[#5a9e6e] font-body">{successMsg}</p>
        )}
        {errorMsg && (
          <p className="text-[0.82rem] text-[#c0544a] font-body">{errorMsg}</p>
        )}

        <button
          type="submit"
          disabled={!authorId.trim() || override.isPending}
          className="bg-gold hover:bg-gold-light text-ink font-body text-sm font-medium uppercase tracking-[0.04em] px-8 py-[0.9rem] rounded-sm transition-colors duration-150 hover:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0 self-start"
        >
          {override.isPending ? 'Applying…' : 'Apply Override'}
        </button>
      </form>
    </div>
  )
}

// ── Cancel Modal ──────────────────────────────────────────────────────────────

interface CancelModalProps {
  booking:  AdminBooking
  onClose:  () => void
  onCancel: (bookingId: string, reason: string) => void
  isPending: boolean
}

const CancelModal = ({ booking, onClose, onCancel, isPending }: CancelModalProps) => {
  const [reason, setReason] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 backdrop-blur-sm">
      <div className="bg-ink-soft border border-gold/15 p-8 max-w-md w-full mx-4 rounded-sm">
        <p className="text-[0.68rem] font-medium tracking-[0.2em] uppercase text-gold mb-1">
          Admin Action
        </p>
        <h3 className="font-display text-lg text-warm-white font-normal mb-1">
          Cancel Booking
        </h3>
        <p className="text-stone-light text-[0.82rem] font-body mb-5">
          Booking <span className="font-mono text-parchment-dim">{booking.bookingId}</span> —{' '}
          {booking.isoWeek} ({formatDate(booking.weekStartDate)}). A Stripe refund will be issued.
        </p>

        <label className="block text-[0.68rem] font-medium tracking-[0.14em] uppercase text-gold mb-2">
          Cancellation Reason
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Required — explain why the booking is being cancelled…"
          className="w-full bg-ink border border-gold/20 focus:border-gold/50 text-parchment-dim placeholder:text-stone-light/40 font-body text-sm px-4 py-3 rounded-sm outline-none transition-colors resize-none mb-5"
        />

        <div className="flex items-center gap-3">
          <button
            onClick={() => onCancel(booking.bookingId, reason)}
            disabled={!reason.trim() || isPending}
            className="bg-[#c0544a] hover:bg-[#d4645a] text-warm-white font-body text-sm font-medium uppercase tracking-[0.04em] px-6 py-[0.9rem] rounded-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isPending ? 'Cancelling…' : 'Confirm Cancel & Refund'}
          </button>
          <button
            onClick={onClose}
            disabled={isPending}
            className="bg-transparent border border-gold/25 hover:border-gold/60 text-parchment-dim hover:text-warm-white font-body text-sm font-light uppercase tracking-[0.04em] px-6 py-[0.9rem] rounded-sm transition-colors disabled:opacity-50"
          >
            Back
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Weekly Bookings Section ───────────────────────────────────────────────────

const STATUSES: BookingStatus[] = ['PENDING_PAYMENT', 'CONFIRMED', 'ACTIVE', 'ARCHIVED', 'CANCELLED']

const WeeklyBookingsSection = () => {
  const queryClient = useQueryClient()
  const [weekFilter,   setWeekFilter]   = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [cursor,       setCursor]       = useState<string | undefined>()
  const [cancelTarget, setCancelTarget] = useState<AdminBooking | null>(null)
  const [cancelError,  setCancelError]  = useState<string | null>(null)

  const queryKey = ['admin', 'weekly-bookings', weekFilter, statusFilter, cursor]

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      adminService.getAdminWeeklyBookings({
        week:   weekFilter   || undefined,
        status: statusFilter || undefined,
        cursor: cursor       || undefined,
        limit:  25,
      }),
  })

  const cancelMutation = useMutation({
    mutationFn: ({ bookingId, reason }: { bookingId: string; reason: string }) =>
      adminService.cancelBooking(bookingId, reason),
    onSuccess: () => {
      setCancelTarget(null)
      setCancelError(null)
      queryClient.invalidateQueries({ queryKey: ['admin', 'weekly-bookings'] })
    },
    onError: () => {
      setCancelError('Cancel failed. The booking may already be cancelled or archived.')
    },
  })

  const applyFilters = (e: React.FormEvent) => {
    e.preventDefault()
    setCursor(undefined)
  }

  const clearFilters = () => {
    setWeekFilter('')
    setStatusFilter('')
    setCursor(undefined)
  }

  return (
    <div className="bg-ink-soft border border-gold/10 p-8">
      <EyebrowLabel>Admin</EyebrowLabel>
      <h2 className="font-display text-xl text-warm-white font-normal mb-2">
        Weekly Feature <em className="italic text-gold-light">Bookings</em>
      </h2>
      <GoldDivider />

      {/* Filters */}
      <form onSubmit={applyFilters} className="flex flex-wrap items-end gap-4 mt-6 mb-8">
        <div>
          <label className="block text-[0.68rem] font-medium tracking-[0.14em] uppercase text-gold mb-2">
            ISO Week
          </label>
          <input
            type="text"
            value={weekFilter}
            onChange={(e) => setWeekFilter(e.target.value)}
            placeholder="e.g. 2025-W20"
            className="bg-ink border border-gold/20 focus:border-gold/50 text-parchment-dim placeholder:text-stone-light/40 font-body text-sm px-4 py-2.5 rounded-sm outline-none transition-colors w-40"
          />
        </div>

        <div>
          <label className="block text-[0.68rem] font-medium tracking-[0.14em] uppercase text-gold mb-2">
            Status
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-ink border border-gold/20 focus:border-gold/50 text-parchment-dim font-body text-sm px-4 py-2.5 rounded-sm outline-none transition-colors"
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{statusBadge[s].label}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="bg-gold hover:bg-gold-light text-ink font-body text-sm font-medium uppercase tracking-[0.04em] px-6 py-2.5 rounded-sm transition-colors duration-150 hover:-translate-y-px"
          >
            Filter
          </button>
          <button
            type="button"
            onClick={clearFilters}
            className="bg-transparent border border-gold/25 hover:border-gold/60 text-parchment-dim hover:text-warm-white font-body text-sm font-light uppercase tracking-[0.04em] px-6 py-2.5 rounded-sm transition-colors"
          >
            Clear
          </button>
        </div>
      </form>

      {cancelError && (
        <p className="text-[0.82rem] text-[#c0544a] font-body mb-4">{cancelError}</p>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse h-12 bg-ink border border-gold/8 rounded-sm" />
          ))}
        </div>
      ) : !data || data.bookings.length === 0 ? (
        <p className="text-[0.82rem] text-stone-light font-body">No bookings found.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[0.82rem]">
              <thead>
                <tr className="border-b border-gold/10">
                  {['Booking ID', 'Author', 'Week', 'Dates', 'Status', 'Amount', 'Action'].map((h) => (
                    <th
                      key={h}
                      className="pb-3 text-[0.68rem] font-medium tracking-[0.12em] uppercase text-stone-light font-body pr-5 whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.bookings.map((booking) => {
                  const badge      = statusBadge[booking.featureStatus]
                  const cancellable = booking.featureStatus !== 'CANCELLED' && booking.featureStatus !== 'ARCHIVED'
                  return (
                    <tr key={booking.bookingId} className="border-b border-gold/[0.06]">
                      <td className="py-3 pr-5 font-mono text-[0.72rem] text-stone-light truncate max-w-[120px]">
                        {booking.bookingId}
                      </td>
                      <td className="py-3 pr-5 font-mono text-[0.72rem] text-stone-light truncate max-w-[120px]">
                        {booking.authorId}
                      </td>
                      <td className="py-3 pr-5 font-mono text-parchment-dim">{booking.isoWeek}</td>
                      <td className="py-3 pr-5 font-light text-stone-light whitespace-nowrap">
                        {formatDate(booking.weekStartDate)} – {formatDate(booking.weekEndDate)}
                      </td>
                      <td className="py-3 pr-5">
                        <span className={`text-[0.68rem] font-medium tracking-[0.1em] uppercase px-2 py-1 rounded-sm ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="py-3 pr-5 font-light text-stone-light">${booking.amountPaidUsd}</td>
                      <td className="py-3">
                        {cancellable && (
                          <button
                            onClick={() => { setCancelTarget(booking); setCancelError(null) }}
                            className="text-[0.72rem] font-medium tracking-[0.08em] uppercase text-[#c0544a] hover:text-[#d4645a] transition-colors"
                          >
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-6">
            <span className="text-[0.78rem] text-stone-light font-body">
              {data.bookings.length} result{data.bookings.length !== 1 ? 's' : ''}
            </span>
            {data.nextCursor && (
              <button
                onClick={() => setCursor(data.nextCursor!)}
                className="text-[0.78rem] font-medium tracking-[0.08em] uppercase text-gold hover:text-gold-light transition-colors"
              >
                Load more →
              </button>
            )}
          </div>
        </>
      )}

      {cancelTarget && (
        <CancelModal
          booking={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onCancel={(bookingId, reason) => cancelMutation.mutate({ bookingId, reason })}
          isPending={cancelMutation.isPending}
        />
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

function AdminFeaturesContent() {
  const { data: me, isLoading } = useMe()

  if (isLoading) return null

  if (me?.account.systemRole !== 'ADMIN') {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="max-w-[1100px] mx-auto py-20 px-8 flex flex-col gap-10">
      <div>
        <p className="text-[0.68rem] font-medium tracking-[0.2em] uppercase text-gold mb-1">
          Admin Panel
        </p>
        <h1 className="font-display text-[clamp(2rem,4vw,3rem)] font-normal text-warm-white leading-[1.12]">
          Feature <em className="italic text-gold-light">Management</em>
        </h1>
      </div>
      <DailyOverrideSection />
      <WeeklyBookingsSection />
    </div>
  )
}

export default function AdminFeaturesPage() {
  return (
    <ProtectedRoute>
      <PageLayout>
        <AdminFeaturesContent />
      </PageLayout>
    </ProtectedRoute>
  )
}
