import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { EyebrowLabel } from '../ui/EyebrowLabel'
import { useReveal } from '../../hooks/use-reveal'
import type { WeeklyFeaturedAuthor, WeeklyFeaturedResponse } from '../../types/features'

function shuffled<T>(arr: T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

interface WeeklyFeaturedCarouselProps {
  data?:      WeeklyFeaturedResponse | null
  isLoading?: boolean
}

const AuthorSlot = ({ author }: { author?: WeeklyFeaturedAuthor }) => (
  <div className="flex-shrink-0 w-52">
    <Link
      to={author ? `/authors/${author.authorId}` : '#'}
      className={`block group no-underline ${!author ? 'pointer-events-none' : ''}`}
    >
      {/* Cover photo → icon avatar → initials placeholder */}
      <div className="aspect-[4/5] bg-ink border border-gold/10 rounded-sm overflow-hidden mb-3 relative">
        {author?.coverPhotoUrl ? (
          <img
            src={author.coverPhotoUrl}
            alt={author.displayName}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : author?.avatarUrl ? (
          <div className="w-full h-full flex items-center justify-center bg-ink-soft">
            <img
              src={author.avatarUrl}
              alt={author.displayName}
              className="w-20 h-20 rounded-full object-cover border border-gold/20"
            />
          </div>
        ) : author ? (
          <div className="w-full h-full flex items-center justify-center bg-ink-soft">
            <div className="w-20 h-20 rounded-full border border-gold/20 bg-ink-raised flex items-center justify-center">
              <span className="font-display text-[1.6rem] text-gold font-semibold leading-none">
                {author.displayName.charAt(0).toUpperCase()}
              </span>
            </div>
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-20 h-20 rounded-full border border-gold/10 bg-ink-raised/50 flex items-center justify-center">
              <span className="font-display text-gold/20 text-[1.4rem]">?</span>
            </div>
          </div>
        )}
        {author && (
          <div className="absolute inset-0 bg-ink/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
            <span className="text-[0.68rem] font-medium tracking-[0.14em] uppercase text-gold">View Profile</span>
          </div>
        )}
      </div>

      {/* Name */}
      <p className="text-[0.82rem] font-light text-parchment-dim truncate group-hover:text-warm-white transition-colors duration-200 mb-2">
        {author?.displayName ?? 'Available'}
      </p>

      {/* 2 recent pieces */}
      {author && author.recentPieces.length > 0 && (
        <div className="flex gap-1.5">
          {author.recentPieces.slice(0, 2).map((piece) => (
            <div
              key={piece.artworkId}
              className="flex-1 aspect-square bg-ink-soft border border-gold/10 rounded-sm overflow-hidden"
            >
              {piece.thumbnailUrl ? (
                <img
                  src={piece.thumbnailUrl}
                  alt={piece.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="font-display text-gold/10 text-[0.6rem]">Art</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Link>
  </div>
)

export const WeeklyFeaturedCarousel = ({ data, isLoading }: WeeklyFeaturedCarouselProps) => {
  // ref must be on an element that is always in the DOM so IntersectionObserver
  // fires correctly regardless of load state.
  const ref = useReveal<HTMLElement>()

  // Shuffle once on mount so order differs each page load (FR-FEAT-16)
  const shuffledAuthors = useMemo(
    () => shuffled(data?.featuredAuthors ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data?.isoWeek],
  )
  const slots = Array.from({ length: data?.slotsTotal ?? 3 }, (_, i) => shuffledAuthors[i] as WeeklyFeaturedAuthor | undefined)

  const weekLabel = data
    ? `${data.weekStartDate} – ${data.weekEndDate}`
    : null

  return (
    <section ref={ref} className="reveal py-28 px-8 bg-ink border-t border-gold/10">
      <div className="max-w-[1100px] mx-auto">
        <div className="flex items-end justify-between mb-12">
          <div>
            <EyebrowLabel>
              {weekLabel ? `Week of ${weekLabel}` : 'Weekly Feature'}
            </EyebrowLabel>
            <h2 className="font-display text-[clamp(2rem,4vw,3rem)] font-normal text-warm-white leading-[1.12]">
              This week's<br />
              <em className="italic text-gold-light">featured artists</em>
            </h2>
          </div>
          <div className="hidden md:flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#5a9e6e] animate-float" />
            <span className="text-[0.78rem] text-stone-light font-light opacity-70">
              {isLoading
                ? '…'
                : `${data?.slotsFilled ?? 0} / ${data?.slotsTotal ?? 3} slots filled`}
            </span>
          </div>
        </div>

        {/* Horizontal scroll row */}
        <div className="flex gap-5 overflow-x-auto pb-4 scrollbar-hide">
          {isLoading
            ? Array.from({ length: data?.slotsTotal ?? 3 }).map((_, i) => (
                <div key={i} className="flex-shrink-0 w-52 animate-pulse">
                  <div className="aspect-[4/5] bg-ink-soft border border-gold/10 rounded-sm mb-3" />
                  <div className="h-3 bg-ink-soft rounded-sm w-3/4 mb-2" />
                  <div className="flex gap-1.5">
                    <div className="flex-1 aspect-square bg-ink-soft rounded-sm" />
                    <div className="flex-1 aspect-square bg-ink-soft rounded-sm" />
                  </div>
                </div>
              ))
            : slots.map((a, i) => <AuthorSlot key={i} author={a} />)
          }
        </div>
      </div>
    </section>
  )
}
