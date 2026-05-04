// FR-DISC-07 — Browse Collections page
// /browse/collections — paginated list of all FREE collections from all authors.

import { useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { EyebrowLabel } from '../components/ui/EyebrowLabel'
import { Button } from '../components/ui/Button'
import { CollectionCard } from '../components/ui/CollectionCard'
import { PageLayout } from '../components/layout/PageLayout'
import { collectionsService } from '../services/collections.service'
import type { BrowseCollection } from '../types/artwork'
import { useReveal } from '../hooks/use-reveal'

export default function BrowseCollectionsPage() {
  const ref = useReveal<HTMLElement>()
  const [_sort] = useState<'newest'>('newest')

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey:         ['collections', 'browse', _sort],
    queryFn:          ({ pageParam }) =>
      collectionsService.browse({ limit: 20, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.cursor,
    staleTime:        5 * 60_000,
  })

  const items: BrowseCollection[] = data?.pages.flatMap((p) => p.items) ?? []

  return (
    <PageLayout>
      {/* Hero */}
      <section className="relative py-32 px-8 bg-ink text-center overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 60% 60% at 50% 40%, rgba(200,151,58,0.06) 0%, transparent 70%)',
          }}
        />
        <div className="relative z-10 max-w-[700px] mx-auto">
          <EyebrowLabel>Curated Series</EyebrowLabel>
          <h1 className="font-display text-[clamp(2.4rem,6vw,4rem)] font-normal text-warm-white leading-[1.1] mt-2">
            Browse<br />
            <em className="italic text-gold-light">Collections</em>
          </h1>
          <p className="mt-6 text-[0.95rem] font-light text-stone-light leading-[1.8]">
            Curated series of works by independent artists — free to explore.
          </p>
        </div>
      </section>

      {/* Grid */}
      <section ref={ref} className="reveal py-20 px-8 bg-ink-soft border-t border-gold/10">
        <div className="max-w-[1100px] mx-auto">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="aspect-[16/9] bg-ink border border-gold/10 rounded-sm" />
                  <div className="bg-ink border border-gold/10 border-t-0 rounded-b-sm p-5">
                    <div className="h-4 bg-ink-soft rounded-sm w-3/4 mb-2" />
                    <div className="h-3 bg-ink-soft rounded-sm w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="text-center text-[0.88rem] font-light text-stone-light py-20">
              No collections published yet. Check back soon.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {items.map((col) => (
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

              {hasNextPage && (
                <div className="mt-12 text-center">
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
