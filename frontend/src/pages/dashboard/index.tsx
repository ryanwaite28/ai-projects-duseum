import { Link } from 'react-router-dom'
import { PageLayout } from '../../components/layout/PageLayout'
import { EyebrowLabel } from '../../components/ui/EyebrowLabel'
import { GoldDivider } from '../../components/ui/GoldDivider'
import { Button } from '../../components/ui/Button'
import { useMe } from '../../hooks/use-me'
import { useSubscriptions } from '../../hooks/use-subscriptions'
import { useAuthStore } from '../../store/auth.store'

function AccountHub() {
  const { user } = useAuthStore()
  const { data: me, isLoading } = useMe()
  const { platform, authorSubscriptions, hasPlatformSub, isLoading: subsLoading } = useSubscriptions()

  const authorProfile = me?.authorProfile ?? null
  const email = user?.email ?? ''
  const initial = email[0]?.toUpperCase() ?? 'U'

  return (
    <PageLayout>
      {/* Header */}
      <section className="py-24 px-8 bg-ink">
        <div className="max-w-[1100px] mx-auto">
          <EyebrowLabel>My Account</EyebrowLabel>
          <div className="flex items-center gap-5 mb-4">
            <div className="w-14 h-14 border-[1.5px] border-gold rounded-md flex items-center justify-center font-display text-[1.4rem] text-gold font-semibold bg-ink-soft flex-shrink-0">
              {initial}
            </div>
            <div>
              <h1 className="font-display text-[clamp(1.8rem,3.5vw,2.6rem)] font-normal text-warm-white leading-[1.1]">
                {isLoading ? (
                  <span className="block w-48 h-8 bg-ink-soft rounded animate-pulse" />
                ) : (
                  email
                )}
              </h1>
              {me?.account && (
                <p className="text-[0.72rem] font-medium tracking-[0.14em] uppercase text-stone-light mt-1">
                  {me.account.systemRole === 'ADMIN' ? 'Administrator' : 'Member'}
                </p>
              )}
            </div>
          </div>
          <GoldDivider />
        </div>
      </section>

      {/* Profile cards */}
      <section className="py-16 px-8 bg-ink-soft border-t border-gold/10">
        <div className="max-w-[1100px] mx-auto">
          <p className="text-[0.72rem] font-medium tracking-[0.18em] uppercase text-stone-light mb-8">
            Your profiles
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-gold/10 border border-gold/10">
            {/* Viewer card */}
            <div className="relative bg-ink p-8 overflow-hidden group transition-colors duration-300 hover:bg-gold/[0.03]">
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gold scale-x-0 group-hover:scale-x-100 transition-transform duration-400 origin-left" />
              <p className="text-[0.62rem] font-medium tracking-[0.16em] uppercase text-gold bg-gold/12 px-[0.6rem] py-[0.25rem] rounded-sm inline-block mb-5">
                Viewer
              </p>
              <h2 className="font-display text-[1.4rem] font-normal text-warm-white mb-3">
                Art lover<br />
                <em className="italic text-gold-light">& subscriber</em>
              </h2>
              <p className="text-[0.85rem] font-light text-stone-light leading-[1.7] mb-6">
                Browse artworks, follow authors, and manage your subscriptions from your viewer dashboard.
              </p>
              <Link to="/dashboard/viewer">
                <Button variant="secondary">Viewer Dashboard</Button>
              </Link>
            </div>

            {/* Author card */}
            <div className="relative bg-ink p-8 overflow-hidden group transition-colors duration-300 hover:bg-gold/[0.03]">
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gold scale-x-0 group-hover:scale-x-100 transition-transform duration-400 origin-left" />
              {authorProfile ? (
                <>
                  <p className="text-[0.62rem] font-medium tracking-[0.16em] uppercase text-gold bg-gold/12 px-[0.6rem] py-[0.25rem] rounded-sm inline-block mb-5">
                    Author
                  </p>
                  <h2 className="font-display text-[1.4rem] font-normal text-warm-white mb-3">
                    {authorProfile.displayName}<br />
                    <em className="italic text-gold-light">creator</em>
                  </h2>
                  <p className="text-[0.85rem] font-light text-stone-light leading-[1.7] mb-6">
                    Manage your pieces, collections, analytics, and Stripe earnings.
                  </p>
                  <Link to="/dashboard/author">
                    <Button variant="secondary">Author Dashboard</Button>
                  </Link>
                </>
              ) : (
                <>
                  <p className="text-[0.62rem] font-medium tracking-[0.16em] uppercase text-stone-light bg-stone/15 px-[0.6rem] py-[0.25rem] rounded-sm inline-block mb-5">
                    Author
                  </p>
                  <h2 className="font-display text-[1.4rem] font-normal text-parchment-dim mb-3">
                    Become an<br />
                    <em className="italic text-gold-light">author</em>
                  </h2>
                  <p className="text-[0.85rem] font-light text-stone-light leading-[1.7] mb-6">
                    Share your work with the world. Publish pieces, grow your audience, and earn through subscriptions.
                  </p>
                  <Link to="/onboarding/author">
                    <Button variant="primary">Get Started</Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Quick links */}
      <section className="py-16 px-8 bg-ink border-t border-gold/10">
        <div className="max-w-[1100px] mx-auto">
          <p className="text-[0.72rem] font-medium tracking-[0.18em] uppercase text-stone-light mb-6">
            Account settings
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/settings/account">
              <Button variant="secondary">Profile Settings</Button>
            </Link>
            <Link to="/settings/notifications">
              <Button variant="secondary">Notifications</Button>
            </Link>
            <Link to="/settings/subscriptions">
              <Button variant="secondary">Subscriptions</Button>
            </Link>
            {me?.account?.systemRole === 'ADMIN' && (
              <Link to="/admin/dashboard">
                <Button variant="ghost">Admin Panel</Button>
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Subscription summary */}
      {!subsLoading && (
        <section className="py-16 px-8 bg-ink-soft border-t border-gold/10">
          <div className="max-w-[1100px] mx-auto">
            <p className="text-[0.72rem] font-medium tracking-[0.18em] uppercase text-stone-light mb-6">
              Active subscriptions
            </p>
            {!hasPlatformSub && authorSubscriptions.length === 0 ? (
              <p className="text-[0.85rem] font-light text-stone-light">
                No active subscriptions.{' '}
                <Link to="/subscriptions" className="text-gold hover:text-gold-light transition-colors">
                  Explore plans →
                </Link>
              </p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {hasPlatformSub && platform && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-ink border border-gold/20 rounded-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#5a9e6e]" />
                    <span className="text-[0.82rem] font-medium text-parchment">Platform plan</span>
                  </div>
                )}
                {authorSubscriptions.filter(s => s.status === 'ACTIVE').map(s => (
                  <div key={s.stripeSubscriptionId} className="flex items-center gap-2 px-4 py-2 bg-ink border border-gold/20 rounded-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#5a9e6e]" />
                    <span className="text-[0.82rem] font-medium text-parchment">Author {s.targetId.slice(0, 8)}…</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </PageLayout>
  )
}

export default function DashboardIndexPage() {
  return <AccountHub />
}
