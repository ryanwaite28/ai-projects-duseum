import { Link } from 'react-router-dom'
import { EyebrowLabel } from '../ui/EyebrowLabel'
import { Button } from '../ui/Button'
import { GoldDivider } from '../ui/GoldDivider'
import { useReveal } from '../../hooks/use-reveal'
import type { DailyFeaturedResponse } from '../../types/features'

interface DailyFeaturedSpotlightProps {
  data?:      DailyFeaturedResponse | null
  isLoading?: boolean
}

const FrameOrnament = () => (
  <div className="relative aspect-[4/5] bg-gold/[0.04] border border-gold/15 rounded-sm overflow-hidden flex items-center justify-center">
    <div className="absolute inset-5 border border-gold/10 rounded-sm" />
    <div className="absolute top-3 left-3 w-5 h-5 border-t-[1.5px] border-l-[1.5px] border-gold/40" />
    <div className="absolute top-3 right-3 w-5 h-5 border-t-[1.5px] border-r-[1.5px] border-gold/40" />
    <div className="absolute bottom-3 left-3 w-5 h-5 border-b-[1.5px] border-l-[1.5px] border-gold/40" />
    <div className="absolute bottom-3 right-3 w-5 h-5 border-b-[1.5px] border-r-[1.5px] border-gold/40" />
    <div className="flex flex-col items-center gap-5 opacity-40">
      <div className="w-[72px] h-[72px] border-[1.5px] border-gold rounded-full relative animate-rotate-slow">
        <div className="absolute inset-2 border border-dashed border-gold/40 rounded-full" />
      </div>
      <span className="font-display italic text-[0.85rem] text-gold tracking-[0.06em]">Duseum</span>
    </div>
  </div>
)

export const DailyFeaturedSpotlight = ({ data, isLoading }: DailyFeaturedSpotlightProps) => {
  // ref must be attached to an element that is always in the DOM so
  // IntersectionObserver fires correctly regardless of load state.
  const ref    = useReveal<HTMLElement>()
  const author = data?.author ?? null

  return (
    <section ref={ref} className="reveal py-28 px-8 bg-ink-soft border-t border-gold/10">
      {isLoading ? (
        <div className="max-w-[1100px] mx-auto grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-20 items-center animate-pulse">
          <div className="aspect-[4/5] bg-ink-raised border border-gold/10 rounded-sm" />
          <div className="flex flex-col gap-4">
            <div className="h-3 bg-ink-raised rounded-sm w-32" />
            <div className="h-10 bg-ink-raised rounded-sm w-3/4" />
            <div className="h-4 bg-ink-raised rounded-sm w-full" />
            <div className="h-4 bg-ink-raised rounded-sm w-5/6" />
          </div>
        </div>
      ) : (
        <div className="max-w-[1100px] mx-auto grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-20 items-center">
          {/* Cover photo or ornament */}
          {author?.coverPhotoUrl ? (
            <div className="relative aspect-[4/5] border border-gold/15 rounded-sm overflow-hidden">
              <img
                src={author.coverPhotoUrl}
                alt={author.displayName}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <FrameOrnament />
          )}

          {/* Content */}
          <div>
            <EyebrowLabel>Daily Featured Author</EyebrowLabel>
            <h2 className="font-display text-[clamp(2rem,4vw,3rem)] font-normal text-warm-white leading-[1.12] mb-4">
              {author ? author.displayName : (
                <><em className="italic text-gold-light">Today's</em><br />featured artist</>
              )}
            </h2>
            <GoldDivider />
            <p className="text-[0.92rem] font-light text-stone-light leading-[1.8] mb-6 max-w-lg">
              {author
                ? author.bio.slice(0, 220) + (author.bio.length > 220 ? '…' : '')
                : 'A new artist is selected each day from our community — celebrating independent voices across every medium and style.'}
            </p>

            {author && (
              <div className="flex items-center gap-6 mb-8">
                <div className="flex flex-col gap-1">
                  <span className="font-display text-[1.5rem] text-warm-white">{author.followerCount.toLocaleString()}</span>
                  <span className="text-[0.68rem] font-medium tracking-[0.14em] uppercase text-stone-light">Followers</span>
                </div>
                <div className="w-px h-10 bg-gold/15" />
                <div className="flex flex-col gap-1">
                  <span className="font-display text-[1.5rem] text-warm-white">{author.subscriberCount.toLocaleString()}</span>
                  <span className="text-[0.68rem] font-medium tracking-[0.14em] uppercase text-stone-light">Subscribers</span>
                </div>
              </div>
            )}

            <div className="flex items-center gap-4 mb-10">
              {author ? (
                <>
                  <Link to={`/authors/${author.authorId}`}>
                    <Button variant="primary">View Profile</Button>
                  </Link>
                  <Link to={`/authors/${author.authorId}`}>
                    <Button variant="secondary">Follow</Button>
                  </Link>
                  {author.authorSubscriptionMonthlyUsd != null && (
                    <Link to={`/authors/${author.authorId}`}>
                      <Button variant="ghost">
                        Subscribe · ${author.authorSubscriptionMonthlyUsd}/mo
                      </Button>
                    </Link>
                  )}
                </>
              ) : (
                <Link to="/authors">
                  <Button variant="secondary">Browse Authors</Button>
                </Link>
              )}
            </div>

            {/* Spotlight pieces */}
            {data && data.spotlightPieces.length > 0 && (
              <div>
                <p className="text-[0.68rem] font-medium tracking-[0.2em] uppercase text-gold mb-4">
                  Pinned Works
                </p>
                <div className="flex gap-4">
                  {data.spotlightPieces.slice(0, 3).map((piece) => (
                    <Link
                      key={piece.artworkId}
                      to={`/artworks/${piece.artworkId}`}
                      className="group flex-shrink-0"
                    >
                      <div className="w-24 aspect-[4/5] bg-ink border border-gold/10 rounded-sm overflow-hidden relative">
                        {piece.thumbnailUrl ? (
                          <img
                            src={piece.thumbnailUrl}
                            alt={piece.title}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="font-display text-gold/20 text-xs">Art</span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-ink/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                      </div>
                      <p className="mt-1.5 text-[0.72rem] font-light text-stone-light truncate w-24 group-hover:text-parchment-dim transition-colors duration-200">
                        {piece.title}
                      </p>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
