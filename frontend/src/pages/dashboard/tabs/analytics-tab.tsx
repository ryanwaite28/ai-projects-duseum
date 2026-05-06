import { useMutation } from '@tanstack/react-query'
import { useMe } from '../../../hooks/use-me'
import { useConnectStatus } from '../../../hooks/use-connect-status'
import { subscriptionsService } from '../../../services/subscriptions.service'

export function AnalyticsTab() {
  const { data: me } = useMe()
  const { data: connectStatus } = useConnectStatus()
  const authorProfile = me?.authorProfile

  const subscriberCount = authorProfile?.subscriberCount ?? 0
  const priceUsd        = authorProfile?.authorSubscriptionMonthlyUsd ?? 0
  const mrrEstimate     = (subscriberCount * priceUsd).toFixed(2)

  const portal = useMutation({
    mutationFn: () => subscriptionsService.createPortalSession(),
    onSuccess:  (res) => { window.location.href = res.portalUrl },
  })

  const connectDashboard = useMutation({
    mutationFn: () => subscriptionsService.createConnectLoginLink(),
    onSuccess:  (res) => { window.location.href = res.loginUrl },
  })

  const chargesEnabled = connectStatus?.chargesEnabled ?? false

  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-ink-soft border border-gold/10 rounded-sm p-5">
          <p className="text-[0.68rem] font-medium tracking-[0.16em] uppercase text-stone-light mb-2">Subscribers</p>
          <p className="font-display text-[1.8rem] font-normal text-warm-white leading-none">
            {subscriberCount.toLocaleString()}
          </p>
        </div>

        <div className="bg-ink-soft border border-gold/10 rounded-sm p-5">
          <p className="text-[0.68rem] font-medium tracking-[0.16em] uppercase text-stone-light mb-2">Plan Price</p>
          <p className="font-display text-[1.8rem] font-normal text-warm-white leading-none">
            {priceUsd > 0 ? `$${priceUsd}` : <span className="text-stone-light text-[1.2rem]">Not set</span>}
          </p>
        </div>

        <div className="bg-ink-soft border border-gold/10 rounded-sm p-5">
          <p className="text-[0.68rem] font-medium tracking-[0.16em] uppercase text-stone-light mb-2">Est. MRR</p>
          <p className="font-display text-[1.8rem] font-normal text-warm-white leading-none">
            ${mrrEstimate}
          </p>
        </div>
      </div>

      {/* Stripe portal */}
      <div className="bg-ink-soft border border-gold/10 rounded-sm p-6">
        <p className="text-[0.68rem] font-medium tracking-[0.2em] uppercase text-gold mb-1">Stripe Billing</p>
        <h3 className="font-display text-lg text-warm-white font-normal mb-2">Manage Your Plan</h3>
        <p className="text-stone-light text-sm font-body font-light mb-5">
          Access the Stripe Customer Portal to view invoices, update payment methods, or cancel your platform subscription.
        </p>
        <button
          onClick={() => portal.mutate()}
          disabled={portal.isPending}
          className="bg-transparent border border-gold/25 hover:border-gold/60 text-parchment-dim hover:text-warm-white font-body text-sm font-light uppercase tracking-[0.04em] px-8 py-[0.9rem] rounded-sm transition-colors disabled:opacity-50"
        >
          {portal.isPending ? 'Redirecting…' : 'Open Billing Portal'}
        </button>
        {portal.isError && (
          <p className="mt-3 text-[0.8rem] text-[#c0544a] font-body">Failed to open portal. Please try again.</p>
        )}
        <p className="mt-4 text-[0.75rem] text-stone-light font-body">
          Note: Author subscription revenue payouts are managed through your Stripe Connect account.
        </p>
      </div>

      {/* Stripe Connect account */}
      <div className="bg-ink-soft border border-gold/10 rounded-sm p-6">
        <p className="text-[0.68rem] font-medium tracking-[0.2em] uppercase text-gold mb-1">Stripe Connect</p>
        <h3 className="font-display text-lg text-warm-white font-normal mb-2">Your Payout Account</h3>

        {chargesEnabled ? (
          <>
            <p className="text-stone-light text-sm font-body font-light mb-5">
              View your earnings, download income statements, and manage payout settings in your Stripe Express Dashboard.
            </p>
            <button
              onClick={() => connectDashboard.mutate()}
              disabled={connectDashboard.isPending}
              className="bg-transparent border border-gold/25 hover:border-gold/60 text-parchment-dim hover:text-warm-white font-body text-sm font-light uppercase tracking-[0.04em] px-8 py-[0.9rem] rounded-sm transition-colors disabled:opacity-50"
            >
              {connectDashboard.isPending ? 'Redirecting…' : 'Open Stripe Dashboard'}
            </button>
            {connectDashboard.isError && (
              <p className="mt-3 text-[0.8rem] text-[#c0544a] font-body">Failed to open dashboard. Please try again.</p>
            )}
          </>
        ) : (
          <p className="text-stone-light text-sm font-body font-light">
            Your Stripe Connect account is still being set up. Once onboarding is complete you'll be able to access your Express Dashboard here.
          </p>
        )}
      </div>
    </div>
  )
}
