import { Link } from 'react-router-dom'
import { EyebrowLabel } from '../components/ui/EyebrowLabel'
import { Button } from '../components/ui/Button'
import { PageLayout } from '../components/layout/PageLayout'
import { DailyFeaturedSpotlight } from '../components/home/DailyFeaturedSpotlight'
import { WeeklyFeaturedCarousel } from '../components/home/WeeklyFeaturedCarousel'
import { ExploreCollectionsSection } from '../components/home/ExploreCollectionsSection'
import { ArtworkGrid, ArtworkGridSkeleton } from '../components/artwork/ArtworkGrid'
import { useArtworks } from '../hooks/use-artworks'
import { useDailyFeatured, useWeeklyFeatured } from '../hooks/use-features'
import { useReveal } from '../hooks/use-reveal'

const HeroSection = () => (
  <section className="relative min-h-screen flex flex-col items-center justify-center text-center px-8 pt-32 pb-24 overflow-hidden bg-ink">
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        background:
          'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(200,151,58,0.06) 0%, transparent 70%), radial-gradient(ellipse 40% 50% at 20% 80%, rgba(200,151,58,0.04) 0%, transparent 60%)',
      }}
    />
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        backgroundImage:
          'linear-gradient(rgba(200,151,58,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(200,151,58,0.04) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
        maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 0%, transparent 100%)',
      }}
    />
    <div className="relative z-10 flex flex-col items-center">
      <EyebrowLabel>Digital Museum</EyebrowLabel>
      <h1 className="font-display text-[clamp(3.2rem,8vw,6.5rem)] font-normal leading-[1.08] tracking-[-0.02em] text-warm-white mb-6 animate-fade-up">
        Discover<br />
        <em className="italic text-gold-light">original art.</em>
      </h1>
      <p className="text-[1.05rem] font-light text-stone-light leading-[1.75] max-w-lg mb-10 animate-fade-in">
        A curated platform for independent artists — with layered access tiers,
        private galleries, and direct patronage.
      </p>
      <div className="flex items-center gap-4 animate-fade-in">
        <Link to="/browse"><Button variant="primary">Browse Gallery</Button></Link>
        <Link to="/authors"><Button variant="secondary">Explore Authors</Button></Link>
      </div>
    </div>
  </section>
)

const RecentPiecesSection = () => {
  const ref = useReveal<HTMLElement>()
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useArtworks({
    sort: 'newest',
    limit: 12,
  })
  const items = data?.pages.flatMap((p) => p.items) ?? []

  return (
    <section ref={ref} className="reveal py-28 px-8 bg-ink border-t border-gold/10">
      <div className="max-w-[1100px] mx-auto">
        <div className="flex items-end justify-between mb-12">
          <div>
            <EyebrowLabel>Recently published</EyebrowLabel>
            <h2 className="font-display text-[clamp(2rem,4vw,3rem)] font-normal text-warm-white leading-[1.12]">
              New from the<br />
              <em className="italic text-gold-light">community</em>
            </h2>
          </div>
          <Link to="/browse" className="hidden md:block">
            <Button variant="ghost">See all</Button>
          </Link>
        </div>

        {isLoading ? (
          <ArtworkGridSkeleton count={12} />
        ) : items.length === 0 ? (
          <p className="text-[0.88rem] font-light text-stone-light text-center py-16">
            No artwork published yet. Be the first!
          </p>
        ) : (
          <>
            <ArtworkGrid items={items} />
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
  )
}

function FeaturedSections() {
  const { data: dailyData, isLoading: dailyLoading }   = useDailyFeatured()
  const { data: weeklyData, isLoading: weeklyLoading } = useWeeklyFeatured()

  return (
    <>
      <DailyFeaturedSpotlight data={dailyData}   isLoading={dailyLoading} />
      <WeeklyFeaturedCarousel data={weeklyData}  isLoading={weeklyLoading} />
      <ExploreCollectionsSection />
    </>
  )
}

export default function HomePage() {
  return (
    <PageLayout>
      <HeroSection />
      <FeaturedSections />
      <RecentPiecesSection />
    </PageLayout>
  )
}
