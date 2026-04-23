import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { PageLayout } from '../components/layout/PageLayout'
import { EyebrowLabel } from '../components/ui/EyebrowLabel'
import { GoldDivider } from '../components/ui/GoldDivider'
import { Button } from '../components/ui/Button'
import { useSubscriptions } from '../hooks/use-subscriptions'
import { subscriptionsService } from '../services/subscriptions.service'
import type { ApiError } from '../services/api'

export default function SubscriptionsPage() {
  const { platform, authorSubscriptions, hasPlatformSub, isLoading } = useSubscriptions()
  const [portalError, setPortalError] = useState<string | null>(null)

  const portalMutation = useMutation({
    mutationFn: () => subscriptionsService.createPortalSession(),
    onSuccess:  (data) => { window.location.href = data.portalUrl },
    onError:    (err: ApiError) => setPortalError(err.message ?? 'Could not open billing portal.'),
  })

  return (
    <PageLayout>
      {/* Header */}
      <section className="py-20 px-8 bg-ink border-b border-gold/10">
        <div className="max-w-[1100px] mx-auto">
          <EyebrowLabel>Account</EyebrowLabel>
          <h1 className="font-display text-[clamp(2rem,4vw,2.8rem)] font-normal text-warm-white leading-[1.12] mb-2">
            Subscriptions
          </h1>
          <GoldDivider />
          <p className="text-[0.92rem] font-light text-stone-light leading-[1.8] max-w-xl">
            Manage your platform plan and author subscriptions.
          </p>
        </div>
      </section>

      {/* Platform subscription */}
      <section className="py-16 px-8 bg-ink-soft border-b border-gold/10">
        <div className="max-w-[1100px] mx-auto">
          <EyebrowLabel>Platform Plan</EyebrowLabel>
          <h2 className="font-display text-[1.6rem] font-normal text-warm-white mb-6">Duseum Access</h2>

          {isLoading ? (
            <div className="h-20 bg-ink rounded-sm animate-pulse" />
          ) : hasPlatformSub && platform ? (
            <div className="bg-ink border border-gold/20 rounded-sm p-6 flex items-center justify-between gap-6">
              <div>
                <p className="text-[0.72rem] font-medium tracking-[0.14em] uppercase text-gold mb-1">Active</p>
                <p className="text-[0.88rem] font-light text-stone-light">
                  Full access to all platform artworks.
                  {platform.currentPeriodEnd && (
                    <> Renews {new Date(platform.currentPeriodEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.</>
                  )}
                </p>
              </div>
              <div className="flex flex-col gap-2 items-end">
                <Button
                  variant="secondary"
                  onClick={() => { setPortalError(null); portalMutation.mutate() }}
                  disabled={portalMutation.isPending}
                >
                  {portalMutation.isPending ? '…' : 'Manage billing'}
                </Button>
                {portalError && (
                  <p className="text-[0.72rem] text-[#c0544a]">{portalError}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-ink border border-gold/15 rounded-sm p-6 flex items-center justify-between gap-6">
              <div>
                <p className="text-[0.72rem] font-medium tracking-[0.14em] uppercase text-stone-light mb-1">Free tier</p>
                <p className="text-[0.88rem] font-light text-stone-light">
                  Upgrade to unlock the full collection.
                </p>
              </div>
              <Button variant="primary" onClick={() => { setPortalError(null); portalMutation.mutate() }} disabled={portalMutation.isPending}>
                {portalMutation.isPending ? '…' : 'Upgrade'}
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* Author subscriptions */}
      <section className="py-16 px-8 bg-ink">
        <div className="max-w-[1100px] mx-auto">
          <EyebrowLabel>Author Subscriptions</EyebrowLabel>
          <h2 className="font-display text-[1.6rem] font-normal text-warm-white mb-6">Supporting authors</h2>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[1, 2].map((i) => (
                <div key={i} className="h-20 bg-ink-soft rounded-sm animate-pulse" />
              ))}
            </div>
          ) : authorSubscriptions.length === 0 ? (
            <p className="text-[0.88rem] font-light text-stone-light py-8">
              You haven't subscribed to any authors yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {authorSubscriptions.map((sub) => (
                <div
                  key={sub.stripeSubscriptionId}
                  className="bg-ink-soft border border-gold/10 rounded-sm p-5 flex items-center justify-between gap-4"
                >
                  <div>
                    <p className="text-[0.88rem] font-light text-warm-white mb-0.5">
                      Author {sub.targetId.slice(0, 8)}…
                    </p>
                    <p className="text-[0.72rem] font-medium tracking-[0.12em] uppercase text-gold">
                      {sub.status}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => { setPortalError(null); portalMutation.mutate() }}
                    disabled={portalMutation.isPending}
                  >
                    Manage
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </PageLayout>
  )
}
