import { Link, useSearchParams } from 'react-router-dom'
import { EyebrowLabel } from '../components/ui/EyebrowLabel'
import { Button } from '../components/ui/Button'
import { PageLayout } from '../components/layout/PageLayout'
import { useAuthors } from '../hooks/use-author'
import { cn } from '../lib/utils'
import type { AuthorProfile } from '../types/artwork'

// ── Author card ────────────────────────────────────────────────────────────────

function AuthorCard({ author }: { author: AuthorProfile }) {
  const bioExcerpt = author.bio.length > 100
    ? author.bio.slice(0, 97).trimEnd() + '…'
    : author.bio

  return (
    <Link
      to={`/authors/${author.userId}`}
      className="relative bg-ink-soft border border-gold/10 rounded-sm p-6 flex flex-col gap-4 hover:border-gold/30 hover:bg-gold/[0.03] transition-all duration-200 group overflow-hidden"
    >
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gold scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />

      {/* Avatar + name */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 border-[1.5px] border-gold/40 rounded-md flex items-center justify-center font-display text-[1rem] text-gold font-semibold bg-ink flex-shrink-0 group-hover:border-gold/70 transition-colors">
          {author.displayName[0]?.toUpperCase() ?? 'A'}
        </div>
        <div className="min-w-0">
          <p className="font-display text-[1rem] font-normal text-warm-white truncate leading-tight">
            {author.displayName}
          </p>
          {author.authorSubscriptionPriceUsd != null ? (
            <span className="text-[0.6rem] font-medium tracking-[0.14em] uppercase text-gold bg-gold/12 px-[0.5rem] py-[0.2rem] rounded-sm">
              ${author.authorSubscriptionPriceUsd}/mo
            </span>
          ) : (
            <span className="text-[0.6rem] font-medium tracking-[0.14em] uppercase text-stone-light bg-white/[0.04] px-[0.5rem] py-[0.2rem] rounded-sm">
              Free
            </span>
          )}
        </div>
      </div>

      {/* Bio excerpt */}
      <p className="text-[0.82rem] font-light text-stone-light leading-[1.65] flex-1">
        {bioExcerpt}
      </p>

      {/* Stats */}
      <div className="flex items-center gap-5 pt-2 border-t border-gold/[0.08]">
        <div>
          <p className="text-[0.65rem] font-medium tracking-[0.12em] uppercase text-stone-light mb-0.5">Followers</p>
          <p className="text-[0.88rem] font-display text-parchment-dim">{author.followerCount.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-[0.65rem] font-medium tracking-[0.12em] uppercase text-stone-light mb-0.5">Subscribers</p>
          <p className="text-[0.88rem] font-display text-parchment-dim">{author.subscriberCount.toLocaleString()}</p>
        </div>
      </div>
    </Link>
  )
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function AuthorCardSkeleton() {
  return (
    <div className="bg-ink-soft border border-gold/10 rounded-sm p-6 animate-pulse">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-md bg-ink-raised flex-shrink-0" />
        <div className="space-y-1.5 flex-1">
          <div className="h-3.5 bg-ink-raised rounded w-3/5" />
          <div className="h-2.5 bg-ink-raised rounded w-1/4" />
        </div>
      </div>
      <div className="space-y-1.5 mb-4">
        <div className="h-2.5 bg-ink-raised rounded w-full" />
        <div className="h-2.5 bg-ink-raised rounded w-4/5" />
        <div className="h-2.5 bg-ink-raised rounded w-3/5" />
      </div>
      <div className="flex gap-5 pt-3 border-t border-gold/[0.06]">
        <div className="h-2.5 bg-ink-raised rounded w-16" />
        <div className="h-2.5 bg-ink-raised rounded w-16" />
      </div>
    </div>
  )
}

// ── Sort toggle ────────────────────────────────────────────────────────────────

function SortToggle({
  sort,
  onChange,
}: {
  sort: 'newest' | 'subscriberCount'
  onChange: (s: 'newest' | 'subscriberCount') => void
}) {
  const btn = (value: 'newest' | 'subscriberCount', label: string) => (
    <button
      key={value}
      onClick={() => onChange(value)}
      className={cn(
        'px-4 py-1.5 text-[0.72rem] font-medium tracking-[0.1em] uppercase rounded-sm border transition-colors duration-150',
        sort === value
          ? 'border-gold text-gold bg-gold/8'
          : 'border-gold/20 text-stone-light hover:border-gold/40 hover:text-parchment-dim',
      )}
    >
      {label}
    </button>
  )

  return (
    <div className="flex items-center gap-2">
      {btn('newest', 'Newest')}
      {btn('subscriberCount', 'Most subscribers')}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AuthorsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const sort = (searchParams.get('sort') ?? 'newest') as 'newest' | 'subscriberCount'

  const setSort = (s: 'newest' | 'subscriberCount') => {
    setSearchParams(s === 'newest' ? {} : { sort: s }, { replace: true })
  }

  const { data, isLoading, isError, isFetchingNextPage, hasNextPage, fetchNextPage } = useAuthors(sort)
  const items = data?.pages.flatMap((p) => p.items) ?? []

  return (
    <PageLayout>
      {/* Hero */}
      <section className="relative py-32 px-8 bg-ink overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(200,151,58,0.05) 0%, transparent 70%)',
          }}
        />
        <div className="relative z-10 max-w-[1100px] mx-auto">
          <EyebrowLabel>Directory</EyebrowLabel>
          <h1 className="font-display text-[clamp(2.4rem,5vw,4rem)] font-normal text-warm-white leading-[1.1] mb-4 animate-fade-up">
            Meet the<br />
            <em className="italic text-gold-light">authors</em>
          </h1>
          <p className="text-[0.95rem] font-light text-stone-light leading-[1.75] max-w-md mb-0 animate-fade-in">
            Independent creators sharing original work — from paintings to photography, digital art to mixed media.
          </p>
        </div>
      </section>

      {/* Directory */}
      <section className="py-16 px-8 bg-ink-soft border-t border-gold/10">
        <div className="max-w-[1100px] mx-auto">
          <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
            <p className="text-[0.72rem] font-medium tracking-[0.18em] uppercase text-stone-light">
              {isLoading ? 'Loading…' : `${items.length.toLocaleString()} author${items.length !== 1 ? 's' : ''}`}
            </p>
            <SortToggle sort={sort} onChange={setSort} />
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => <AuthorCardSkeleton key={i} />)}
            </div>
          ) : isError ? (
            <div className="py-20 text-center border border-gold/10 rounded-sm bg-ink">
              <p className="text-[0.88rem] font-light text-stone-light">
                Failed to load authors. Please try again.
              </p>
            </div>
          ) : items.length === 0 ? (
            <div className="py-20 text-center border border-gold/10 rounded-sm bg-ink">
              <p className="text-[0.88rem] font-light text-stone-light">No authors found.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((author) => (
                  <AuthorCard key={author.userId} author={author} />
                ))}
              </div>

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
    </PageLayout>
  )
}
