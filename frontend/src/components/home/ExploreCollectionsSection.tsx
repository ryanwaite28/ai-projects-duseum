// FR-DISC-06 — Homepage "Explore Collections" section
// Shows up to 6 randomly sampled FREE collections.
// Uses GET /collections?limit=6 (the same browse endpoint with a small limit).

import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { EyebrowLabel } from '../ui/EyebrowLabel'
import { Button } from '../ui/Button'
import { CollectionCard } from '../ui/CollectionCard'
import { collectionsService } from '../../services/collections.service'
import { useReveal } from '../../hooks/use-reveal'

const exploreCollectionsQueryKey = ['collections', 'explore'] as const

export function ExploreCollectionsSection() {
  const ref = useReveal<HTMLElement>()
  const { data, isLoading } = useQuery({
    queryKey: exploreCollectionsQueryKey,
    queryFn:  () => collectionsService.browse({ limit: 6 }),
    staleTime: 10 * 60_000, // 10 min
  })

  const collections = data?.items ?? []

  // Don't render the section at all when loaded and empty
  if (!isLoading && collections.length === 0) return null

  return (
    <section ref={ref} className="reveal py-28 px-8 bg-ink-soft border-t border-gold/10">
      <div className="max-w-[1100px] mx-auto">
        <div className="flex items-end justify-between mb-12">
          <div>
            <EyebrowLabel>Curated series</EyebrowLabel>
            <h2 className="font-display text-[clamp(2rem,4vw,3rem)] font-normal text-warm-white leading-[1.12]">
              Explore<br />
              <em className="italic text-gold-light">collections</em>
            </h2>
          </div>
          <Link to="/browse/collections" className="hidden md:block">
            <Button variant="ghost">Browse all</Button>
          </Link>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-[16/9] bg-ink border border-gold/10 rounded-sm mb-0" />
                <div className="bg-ink-soft border border-gold/10 border-t-0 rounded-b-sm p-5">
                  <div className="h-4 bg-ink rounded-sm w-3/4 mb-2" />
                  <div className="h-3 bg-ink rounded-sm w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {collections.map((col) => (
              <CollectionCard
                key={col.collectionId}
                collectionId={col.collectionId}
                title={col.title}
                description={col.description}
                posterUrl={col.posterUrl}
                authorId={col.authorId}
                authorDisplayName={col.authorDisplayName}
                pieceCount={col.pieceCount}
                visibility={col.visibility}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
