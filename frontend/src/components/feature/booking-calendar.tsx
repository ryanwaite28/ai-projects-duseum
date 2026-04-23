import { cn } from '../../lib/utils'
import type { WeeklyAvailabilityWeek } from '../../types/features'

interface BookingCalendarProps {
  weeks:           WeeklyAvailabilityWeek[]
  selectedWeek:    string | null
  onSelect:        (isoWeek: string) => void
  disabledWeeks?:  Set<string>
}

const formatDateRange = (start: string, end: string): string => {
  const s = new Date(start + 'T00:00:00Z')
  const e = new Date(end   + 'T00:00:00Z')
  const fmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  return `${fmt.format(s)} – ${fmt.format(e)}`
}

export const BookingCalendar = ({
  weeks,
  selectedWeek,
  onSelect,
  disabledWeeks = new Set(),
}: BookingCalendarProps) => (
  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
    {weeks.map((week) => {
      const unavailable = !week.isAvailable || disabledWeeks.has(week.isoWeek)
      const selected    = selectedWeek === week.isoWeek

      return (
        <button
          key={week.isoWeek}
          disabled={unavailable}
          onClick={() => !unavailable && onSelect(week.isoWeek)}
          className={cn(
            'relative p-4 text-left border rounded-sm transition-all duration-150',
            'focus:outline-none focus-visible:ring-1 focus-visible:ring-gold/60',
            unavailable
              ? 'border-gold/8 bg-ink/40 opacity-40 cursor-not-allowed'
              : selected
                ? 'border-gold bg-gold/[0.08] cursor-pointer'
                : 'border-gold/15 bg-ink hover:border-gold/40 hover:bg-gold/[0.04] cursor-pointer'
          )}
        >
          {selected && (
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gold rounded-t-sm" />
          )}
          <p className="font-mono text-[0.72rem] text-stone-light mb-1 tracking-[0.08em]">
            {week.isoWeek}
          </p>
          <p className="text-[0.78rem] font-light text-parchment-dim mb-3 leading-tight">
            {formatDateRange(week.weekStartDate, week.weekEndDate)}
          </p>
          {week.isAvailable ? (
            <div className="flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-[#5a9e6e]" />
              <span className="text-[0.68rem] font-medium tracking-[0.1em] uppercase text-[#5a9e6e]">
                {week.slotsAvailable} slot{week.slotsAvailable !== 1 ? 's' : ''} left
              </span>
            </div>
          ) : (
            <span className="text-[0.68rem] font-medium tracking-[0.1em] uppercase text-stone-light">
              Fully booked
            </span>
          )}
        </button>
      )
    })}
  </div>
)
