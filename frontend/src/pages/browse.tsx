import { useSearchParams } from 'react-router-dom'
import { EyebrowLabel } from '../components/ui/EyebrowLabel'
import { Button } from '../components/ui/Button'
import { PageLayout } from '../components/layout/PageLayout'
import { ArtworkGrid, ArtworkGridSkeleton } from '../components/artwork/ArtworkGrid'
import { useArtworks } from '../hooks/use-artworks'
import { cn } from '../lib/utils'
import type { ArtworkCategory } from '../types/artwork'

const CATEGORIES: { value: ArtworkCategory | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'PAINTING', label: 'Painting' },
  { value: 'ILLUSTRATION', label: 'Illustration' },
  { value: 'DIGITAL', label: 'Digital' },
  { value: 'PHOTOGRAPHY', label: 'Photography' },
  { value: 'SCULPTURE', label: 'Sculpture' },
  { value: 'MIXED_MEDIA', label: 'Mixed Media' },
]

const SORTS = [
  { value: 'newest',     label: 'Newest' },
  { value: 'trending',   label: 'Trending' },
  { value: 'mostViewed', label: 'Most viewed' },
] as const

export default function BrowsePage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const category = (searchParams.get('category') ?? '') as ArtworkCategory | ''
  const sort     = (searchParams.get('sort') ?? 'newest') as 'newest' | 'trending' | 'mostViewed'
  const tag      = searchParams.get('tag') ?? undefined

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
  }

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage, isError } = useArtworks({
    category: category || undefined,
    sort,
    tag,
    limit: 24,
  })

  const items = data?.pages.flatMap((p) => p.items) ?? []
  const total = data?.pages[0]?.totalVisible

  return (
    <PageLayout>
      <section className="min-h-screen py-32 px-8 bg-ink">
        <div className="max-w-[1100px] mx-auto">
          {/* Header */}
          <div className="mb-12">
            <EyebrowLabel>Browse</EyebrowLabel>
            <h1 className="font-display text-[clamp(2rem,4vw,3rem)] font-normal text-warm-white leading-[1.12]">
              Explore the<br />
              <em className="italic text-gold-light">gallery</em>
            </h1>
            {total !== undefined && (
              <p className="mt-2 text-[0.82rem] font-light text-stone-light">
                {total.toLocaleString()} piece{total !== 1 ? 's' : ''} found
              </p>
            )}
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-10 pb-6 border-b border-gold/10">
            {/* Category chips */}
            <div className="flex flex-wrap gap-2 flex-1">
              {CATEGORIES.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setParam('category', value)}
                  className={cn(
                    'font-body text-[0.72rem] font-medium uppercase tracking-[0.1em] px-4 py-1.5 rounded-sm border transition-all duration-200',
                    category === value
                      ? 'bg-gold/15 border-gold/50 text-gold'
                      : 'bg-transparent border-gold/15 text-stone-light hover:border-gold/35 hover:text-parchment-dim'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Sort */}
            <select
              value={sort}
              onChange={(e) => setParam('sort', e.target.value)}
              className="bg-ink-soft border border-gold/20 rounded-sm px-4 py-2 text-[0.82rem] font-light text-parchment outline-none transition-colors duration-200 appearance-none flex-shrink-0"
            >
              {SORTS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {/* Active tag filter */}
          {tag && (
            <div className="flex items-center gap-3 mb-8">
              <span className="text-[0.72rem] font-light text-stone-light">Filtered by tag:</span>
              <span className="inline-flex items-center gap-1.5 font-mono text-[0.75rem] text-gold bg-gold/8 border border-gold/25 px-3 py-1 rounded-sm">
                {tag}
                <button
                  onClick={() => setParam('tag', '')}
                  className="text-gold/60 hover:text-gold transition-colors duration-150"
                >
                  ×
                </button>
              </span>
            </div>
          )}

          {/* Grid */}
          {isLoading ? (
            <ArtworkGridSkeleton count={24} />
          ) : isError ? (
            <p className="text-center py-24 text-[0.88rem] font-light text-stone-light">
              Failed to load artworks. Please try again.
            </p>
          ) : items.length === 0 ? (
            <p className="text-center py-24 text-[0.88rem] font-light text-stone-light">
              No artworks match your filters.
            </p>
          ) : (
            <>
              <ArtworkGrid items={items} />
              {hasNextPage && (
                <div className="mt-14 text-center">
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
