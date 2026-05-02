import { Link } from 'react-router-dom'
import { PageLayout } from '../../components/layout/PageLayout'
import { EyebrowLabel } from '../../components/ui/EyebrowLabel'
import { GoldDivider } from '../../components/ui/GoldDivider'
import { Button } from '../../components/ui/Button'
import { ArtworkGrid, ArtworkGridSkeleton } from '../../components/artwork/ArtworkGrid'
import { useArtworks } from '../../hooks/use-artworks'
import { useNotificationPreferences } from '../../hooks/use-follows'
import { useSubscriptions } from '../../hooks/use-subscriptions'
import { useMe } from '../../hooks/use-me'

// ── Followed authors section ──────────────────────────────────────────────────

function FollowedAuthorsSection() {
  const { data, isLoading } = useNotificationPreferences()
  const overrides = data?.perAuthorOverrides ?? []

  return (
    <section className="py-16 px-8 bg-ink-soft border-t border-gold/10">
      <div className="max-w-[1100px] mx-auto">
        <div className="flex items-end justify-between mb-8">
          <div>
            <EyebrowLabel>Following</EyebrowLabel>
            <h2 className="font-display text-[1.5rem] font-normal text-warm-white">
              Authors you follow
            </h2>
          </div>
          <Link to="/authors">
            <Button variant="ghost">Browse Authors</Button>
          </Link>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 bg-ink rounded-sm animate-pulse" />
            ))}
          </div>
        ) : overrides.length === 0 ? (
          <div className="py-10 text-center border border-gold/10 rounded-sm bg-ink">
            <p className="text-[0.88rem] font-light text-stone-light mb-4">
              You haven't followed any authors yet.
            </p>
            <Link to="/authors">
              <Button variant="primary">Discover Authors</Button>
            </Link>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {overrides.map((o) => (
              <Link
                key={o.authorId}
                to={`/authors/${o.authorId}`}
                className="flex items-center gap-3 px-4 py-3 bg-ink border border-gold/15 rounded-sm hover:border-gold/35 hover:bg-gold/[0.03] transition-all duration-150"
              >
                <div className="w-7 h-7 border border-gold/40 rounded-md flex items-center justify-center font-display text-[0.75rem] text-gold font-semibold flex-shrink-0 bg-ink-soft">
                  {(o.displayName ?? o.authorId)[0]?.toUpperCase() ?? 'A'}
                </div>
                <span className="text-[0.82rem] font-medium text-parchment-dim">
                  {o.displayName ?? `Author ${o.authorId.slice(0, 8)}…`}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

// ── Subscriptions summary ─────────────────────────────────────────────────────

function SubscriptionsSummary() {
  const { platform, authorSubscriptions, hasPlatformSub, isLoading } = useSubscriptions()

  if (isLoading) return null

  const activeAuthorSubs = authorSubscriptions.filter(s => s.status === 'ACTIVE')

  return (
    <section className="py-16 px-8 bg-ink border-t border-gold/10">
      <div className="max-w-[1100px] mx-auto">
        <div className="flex items-end justify-between mb-8">
          <div>
            <EyebrowLabel>Subscriptions</EyebrowLabel>
            <h2 className="font-display text-[1.5rem] font-normal text-warm-white">
              Your plans
            </h2>
          </div>
          <Link to="/settings/subscriptions">
            <Button variant="ghost">Manage</Button>
          </Link>
        </div>

        {!hasPlatformSub && activeAuthorSubs.length === 0 ? (
          <div className="py-10 text-center border border-gold/10 rounded-sm bg-ink-soft">
            <p className="text-[0.88rem] font-light text-stone-light mb-4">
              Upgrade to unlock the full collection.
            </p>
            <Link to="/subscriptions">
              <Button variant="primary">View Plans</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {hasPlatformSub && platform && (
              <div className="bg-ink-soft border border-gold/20 rounded-sm p-5 flex items-center gap-4">
                <span className="w-2 h-2 rounded-full bg-[#5a9e6e] flex-shrink-0" />
                <div>
                  <p className="text-[0.88rem] font-medium text-parchment">Platform plan</p>
                  <p className="text-[0.72rem] font-light text-stone-light mt-0.5">
                    {platform.currentPeriodEnd
                      ? `Renews ${new Date(platform.currentPeriodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                      : 'Active'}
                  </p>
                </div>
              </div>
            )}
            {activeAuthorSubs.map(s => (
              <div key={s.stripeSubscriptionId} className="bg-ink-soft border border-gold/20 rounded-sm p-5 flex items-center gap-4">
                <span className="w-2 h-2 rounded-full bg-[#5a9e6e] flex-shrink-0" />
                <div>
                  <p className="text-[0.88rem] font-medium text-parchment">Author {s.targetId.slice(0, 8)}…</p>
                  <p className="text-[0.72rem] font-light text-stone-light mt-0.5">Active</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

// ── Recent artworks feed ──────────────────────────────────────────────────────

function RecentFeedSection() {
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useArtworks({
    sort: 'newest',
    limit: 8,
  })
  const items = data?.pages.flatMap((p) => p.items) ?? []

  return (
    <section className="py-16 px-8 bg-ink-soft border-t border-gold/10">
      <div className="max-w-[1100px] mx-auto">
        <div className="flex items-end justify-between mb-8">
          <div>
            <EyebrowLabel>Discover</EyebrowLabel>
            <h2 className="font-display text-[1.5rem] font-normal text-warm-white">
              Recent artworks
            </h2>
          </div>
          <Link to="/browse">
            <Button variant="ghost">Browse All</Button>
          </Link>
        </div>

        {isLoading ? (
          <ArtworkGridSkeleton count={8} />
        ) : (
          <>
            <ArtworkGrid items={items} />
            {hasNextPage && (
              <div className="flex justify-center mt-10">
                <Button
                  variant="secondary"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? 'Loading…' : 'Load more'}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

function ViewerDashboardContent() {
  const { data: me, isLoading } = useMe()

  const displayName = me?.viewerProfile?.displayName ?? me?.account?.email ?? ''

  return (
    <PageLayout>
      {/* Header */}
      <section className="py-24 px-8 bg-ink">
        <div className="max-w-[1100px] mx-auto">
          <EyebrowLabel>Viewer Dashboard</EyebrowLabel>
          <h1 className="font-display text-[clamp(2rem,4vw,3rem)] font-normal text-warm-white leading-[1.12] mb-2">
            {isLoading ? (
              <span className="block w-56 h-9 bg-ink-soft rounded animate-pulse" />
            ) : (
              <>Welcome back,<br /><em className="italic text-gold-light">{displayName || 'art lover'}</em></>
            )}
          </h1>
          <GoldDivider />
          <div className="flex gap-3 mt-6">
            <Link to="/dashboard">
              <Button variant="secondary">← My Account</Button>
            </Link>
          </div>
        </div>
      </section>

      <FollowedAuthorsSection />
      <SubscriptionsSummary />
      <RecentFeedSection />
    </PageLayout>
  )
}

export default function DashboardViewerPage() {
  return <ViewerDashboardContent />
}
