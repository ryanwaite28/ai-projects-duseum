import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '../../../components/ui/Button'
import { subscriptionsService } from '../../../services/subscriptions.service'
import { useMe } from '../../../hooks/use-me'

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  ACTIVE:     { label: 'Active',      color: 'text-[#5a9e6e]' },
  PAST_DUE:   { label: 'Past due',    color: 'text-[#c8973a]' },
  CANCELLED:  { label: 'Cancelled',   color: 'text-stone-light' },
  INCOMPLETE: { label: 'Incomplete',  color: 'text-stone-light' },
  PAUSED:     { label: 'Paused',      color: 'text-parchment-dim' },
}

export function SubscribersTab() {
  const { data: me } = useMe()
  const [cursor, setCursor] = useState<string | undefined>(undefined)
  const [pages, setPages] = useState<string[]>([]) // cursor history for prev navigation

  const { data, isLoading, isError } = useQuery({
    queryKey: ['subscriptions', 'me', 'subscribers', cursor],
    queryFn:  () => subscriptionsService.getMySubscribers(cursor),
    staleTime: 30_000,
  })

  const subscriberCount = me?.authorProfile?.subscriberCount ?? 0

  const handleNext = () => {
    if (!data?.nextCursor) return
    setPages((prev) => [...prev, cursor ?? ''])
    setCursor(data.nextCursor)
  }

  const handlePrev = () => {
    const prev = pages[pages.length - 1]
    setPages((p) => p.slice(0, -1))
    setCursor(prev === '' ? undefined : prev)
  }

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[0.68rem] font-medium tracking-[0.16em] uppercase text-stone-light mb-1">
            Total subscribers
          </p>
          <p className="font-display text-[2rem] font-normal text-warm-white leading-none">
            {subscriberCount.toLocaleString()}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-14 bg-ink-soft rounded-sm animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <div className="py-10 text-center border border-gold/10 rounded-sm bg-ink-soft">
          <p className="text-[0.88rem] font-light text-stone-light">
            Failed to load subscribers. Please try again.
          </p>
        </div>
      ) : data?.items.length === 0 && pages.length === 0 ? (
        <div className="py-16 text-center border border-gold/10 rounded-sm bg-ink-soft">
          <p className="text-[0.88rem] font-light text-stone-light mb-2">No subscribers yet.</p>
          <p className="text-[0.78rem] font-light text-stone-light">
            Set a subscription price and connect Stripe to start earning.
          </p>
        </div>
      ) : (
        <>
          <div className="bg-ink-soft border border-gold/10 rounded-sm overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gold/10">
                  <th className="py-3 px-4 text-left text-[0.68rem] tracking-[0.14em] uppercase text-stone-light font-medium">
                    Subscriber ID
                  </th>
                  <th className="py-3 px-4 text-left text-[0.68rem] tracking-[0.14em] uppercase text-stone-light font-medium hidden sm:table-cell">
                    Since
                  </th>
                  <th className="py-3 px-4 text-left text-[0.68rem] tracking-[0.14em] uppercase text-stone-light font-medium hidden md:table-cell">
                    Renews
                  </th>
                  <th className="py-3 px-4 text-right text-[0.68rem] tracking-[0.14em] uppercase text-stone-light font-medium">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {(data?.items ?? []).map((sub) => {
                  const statusInfo = STATUS_LABELS[sub.status] ?? { label: sub.status, color: 'text-stone-light' }
                  return (
                    <tr key={sub.stripeSubscriptionId} className="border-b border-gold/[0.06] last:border-0">
                      <td className="py-3 px-4">
                        <span className="font-mono text-[0.75rem] text-parchment-dim">
                          {sub.userId.slice(0, 8)}…
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[0.78rem] text-stone-light hidden sm:table-cell">
                        {new Date(sub.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="py-3 px-4 text-[0.78rem] text-stone-light hidden md:table-cell">
                        {sub.currentPeriodEnd
                          ? new Date(sub.currentPeriodEnd).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          : '—'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className={`text-[0.72rem] font-medium tracking-[0.1em] uppercase ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {(pages.length > 0 || data?.nextCursor) && (
            <div className="flex items-center justify-between mt-4">
              <Button
                variant="secondary"
                onClick={handlePrev}
                disabled={pages.length === 0}
              >
                ← Previous
              </Button>
              <Button
                variant="secondary"
                onClick={handleNext}
                disabled={!data?.nextCursor}
              >
                Next →
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
