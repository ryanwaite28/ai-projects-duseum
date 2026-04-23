import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useMe, useMeQueryKey } from '../../../hooks/use-me'
import { useConnectStatus } from '../../../hooks/use-connect-status'
import { listArtworks } from '../../../services/artworks.service'
import { authorDashboardService } from '../../../services/author-dashboard.service'
import type { ApiError } from '../../../services/api'

// ── Stat card ─────────────────────────────────────────────────────────────────

const StatCard = ({ label, value }: { label: string; value: string | number }) => (
  <div className="bg-ink border border-gold/10 rounded-sm p-5">
    <p className="text-[0.68rem] font-medium tracking-[0.16em] uppercase text-stone-light mb-2">{label}</p>
    <p className="font-display text-[1.8rem] font-normal text-warm-white leading-none">{value}</p>
  </div>
)

// ── Connect Stripe section ────────────────────────────────────────────────────

function ConnectStripeSection() {
  const { data: me } = useMe()
  const authorProfile = me?.authorProfile
  const hasConnectId = !!authorProfile?.stripeConnectAccountId
  const { data: connectStatus, isLoading: statusLoading } = useConnectStatus(hasConnectId)

  const onboardMutation = useMutation({
    mutationFn: () => authorDashboardService.connectOnboard(),
    onSuccess:  (data) => { window.location.href = data.accountLinkUrl },
  })

  const isConnected = connectStatus?.chargesEnabled === true

  return (
    <div className="bg-ink-soft border border-gold/10 rounded-sm p-6">
      <p className="text-[0.68rem] font-medium tracking-[0.2em] uppercase text-gold mb-1">Stripe Connect</p>
      <h3 className="font-display text-lg text-warm-white font-normal mb-3">Payment Account</h3>
      <p className="text-stone-light text-sm font-body font-light mb-5">
        Connect a Stripe account to receive Author subscription payments.
      </p>

      {isConnected ? (
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#5a9e6e]" />
          <span className="text-sm font-body text-parchment-dim">Stripe account connected</span>
          {connectStatus?.stripeConnectAccountId && (
            <span className="font-mono text-[0.75rem] text-stone-light ml-2">
              {connectStatus.stripeConnectAccountId}
            </span>
          )}
        </div>
      ) : statusLoading && hasConnectId ? (
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-gold animate-float" />
          <span className="text-sm font-body text-stone-light">Checking status…</span>
        </div>
      ) : (
        <button
          onClick={() => onboardMutation.mutate()}
          disabled={onboardMutation.isPending}
          className="bg-gold hover:bg-gold-light text-ink font-body text-sm font-medium uppercase tracking-[0.04em] px-8 py-[0.9rem] rounded-sm transition-colors duration-150 hover:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0"
        >
          {onboardMutation.isPending ? 'Redirecting…' : 'Connect Stripe'}
        </button>
      )}

      {onboardMutation.isError && (
        <p className="mt-3 text-[0.8rem] text-[#c0544a] font-body">
          {(onboardMutation.error as ApiError).message ?? 'Something went wrong.'}
        </p>
      )}

      {hasConnectId && !isConnected && !statusLoading && (
        <p className="mt-4 text-[0.8rem] text-stone-light font-body">
          Onboarding not yet complete.{' '}
          <button
            onClick={() => onboardMutation.mutate()}
            className="text-gold underline underline-offset-2 hover:text-gold-light"
          >
            Resume onboarding
          </button>
        </p>
      )}
    </div>
  )
}

// ── Subscription price section ────────────────────────────────────────────────

function SubscriptionPriceSection() {
  const qc = useQueryClient()
  const { data: me } = useMe()
  const authorProfile = me?.authorProfile
  const { data: connectStatus } = useConnectStatus(!!authorProfile?.stripeConnectAccountId)
  const isConnected = connectStatus?.chargesEnabled === true

  const [amountInput, setAmountInput] = useState(
    authorProfile?.authorSubscriptionPriceUsd?.toString() ?? ''
  )
  const [formError, setFormError] = useState<string | null>(null)

  const priceMutation = useMutation({
    mutationFn: (amountUsd: number) => authorDashboardService.setSubscriptionPrice(amountUsd),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: useMeQueryKey }); setFormError(null) },
    onError:    (err: ApiError) => { setFormError(err.message ?? 'Failed to update price.') },
  })

  const handleSetPrice = () => {
    const val = parseInt(amountInput, 10)
    if (isNaN(val) || val < 1 || val > 50) { setFormError('Enter a whole number between 1 and 50.'); return }
    setFormError(null)
    priceMutation.mutate(val)
  }

  const currentPrice = authorProfile?.authorSubscriptionPriceUsd

  return (
    <div className="bg-ink-soft border border-gold/10 rounded-sm p-6">
      <p className="text-[0.68rem] font-medium tracking-[0.2em] uppercase text-gold mb-1">Monetization</p>
      <h3 className="font-display text-lg text-warm-white font-normal mb-3">Subscription Price</h3>
      <p className="text-stone-light text-sm font-body font-light mb-5">
        Set a monthly price ($1–$50) for access to your private gallery.
      </p>

      {!isConnected ? (
        <p className="text-sm font-body text-stone-light">Connect your Stripe account above before setting a price.</p>
      ) : (
        <>
          {currentPrice != null && (
            <p className="mb-4 text-sm font-body text-parchment-dim">
              Current price: <span className="text-gold font-medium">${currentPrice}/month</span>
            </p>
          )}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-light font-body text-sm">$</span>
              <input
                type="number" min={1} max={50} step={1}
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="e.g. 5"
                className="bg-ink border border-gold/20 focus:border-gold/60 outline-none text-parchment font-body text-sm pl-7 pr-4 py-[0.7rem] rounded-sm w-28 transition-colors"
              />
            </div>
            <span className="text-stone-light font-body text-sm">/month</span>
            <button
              onClick={handleSetPrice}
              disabled={priceMutation.isPending}
              className="bg-gold hover:bg-gold-light text-ink font-body text-sm font-medium uppercase tracking-[0.04em] px-6 py-[0.7rem] rounded-sm transition-colors duration-150 hover:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0"
            >
              {priceMutation.isPending ? 'Saving…' : currentPrice != null ? 'Update' : 'Set Price'}
            </button>
          </div>

          {formError && <p className="text-[0.8rem] text-[#c0544a] font-body mb-3">{formError}</p>}

          {currentPrice != null && (
            <button
              onClick={() => priceMutation.mutate(0)}
              disabled={priceMutation.isPending}
              className="bg-transparent border border-gold/25 hover:border-gold/60 text-parchment-dim hover:text-warm-white font-body text-sm font-light uppercase tracking-[0.04em] px-6 py-[0.7rem] rounded-sm transition-colors disabled:opacity-50"
            >
              Disable Subscriptions
            </button>
          )}

          {priceMutation.isSuccess && !priceMutation.isPending && (
            <p className="mt-3 text-[0.8rem] text-[#5a9e6e] font-body">
              {priceMutation.data?.monthlyUsd == null ? 'Subscriptions disabled.' : 'Price updated successfully.'}
            </p>
          )}
        </>
      )}
    </div>
  )
}

// ── Overview tab ──────────────────────────────────────────────────────────────

export function OverviewTab() {
  const { data: me } = useMe()
  const authorProfile = me?.authorProfile

  const { data: recentRes } = useQuery({
    queryKey: ['artworks', 'author', me?.account.userId, 'recent'],
    queryFn:  () => listArtworks({ authorId: me!.account.userId, sort: 'newest', limit: 3 }),
    enabled:  !!me?.account.userId,
  })

  const recentPieces = recentRes?.items ?? []
  const totalViews   = recentPieces.reduce((sum, p) => sum + p.viewCount, 0)
  const mrr          = authorProfile
    ? (authorProfile.subscriberCount * (authorProfile.authorSubscriptionMonthlyUsd ?? 0))
    : 0

  return (
    <div className="space-y-8">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Recent Views"  value={totalViews.toLocaleString()} />
        <StatCard label="Followers"     value={(authorProfile?.followerCount ?? 0).toLocaleString()} />
        <StatCard label="Subscribers"   value={(authorProfile?.subscriberCount ?? 0).toLocaleString()} />
        <StatCard label="Est. MRR"      value={`$${mrr.toFixed(2)}`} />
      </div>

      {/* Recent pieces */}
      {recentPieces.length > 0 && (
        <div>
          <p className="text-[0.68rem] font-medium tracking-[0.16em] uppercase text-stone-light mb-3">Recent Pieces</p>
          <div className="bg-ink-soft border border-gold/10 rounded-sm overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gold/10">
                  <th className="py-3 px-4 text-left text-[0.68rem] tracking-[0.14em] uppercase text-stone-light font-medium">Title</th>
                  <th className="py-3 px-4 text-right text-[0.68rem] tracking-[0.14em] uppercase text-stone-light font-medium">Views</th>
                  <th className="py-3 px-4 text-right text-[0.68rem] tracking-[0.14em] uppercase text-stone-light font-medium">Notified</th>
                </tr>
              </thead>
              <tbody>
                {recentPieces.map((p) => (
                  <tr key={p.artworkId} className="border-b border-gold/[0.06] last:border-0">
                    <td className="py-3 px-4 text-[0.82rem] text-parchment">{p.title}</td>
                    <td className="py-3 px-4 text-right text-[0.78rem] text-stone-light">{p.viewCount.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right text-[0.78rem] text-stone-light">{(p.notifiedCount ?? 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Setup sections */}
      <div className="grid md:grid-cols-2 gap-4">
        <ConnectStripeSection />
        <SubscriptionPriceSection />
      </div>
    </div>
  )
}
