import { Link } from 'react-router-dom'
import { cn } from '../../lib/utils'
import type { ArtworkListItem } from '../../types/artwork'

interface ArtworkCardProps {
  artwork:      ArtworkListItem
  /** When true, caller has confirmed the user cannot access this private piece */
  inaccessible?: boolean
  /** Passed as React Router Link state for use on the detail page */
  linkState?:    Record<string, unknown>
  className?:    string
}

const REACTION_ICONS: Record<string, string> = {
  LOVE: '♥', WOW: '✦', FIRE: '🔥', INSPIRED: '✸',
}

export const ArtworkCard = ({ artwork, inaccessible = false, linkState, className }: ArtworkCardProps) => {
  const totalReactions = Object.values(artwork.reactionCounts).reduce((a, b) => a + (b ?? 0), 0)

  return (
    <Link
      to={`/artworks/${artwork.artworkId}`}
      state={linkState}
      className={cn('group block no-underline', className)}
    >
      {/* Image frame */}
      <div className="relative aspect-[4/5] bg-ink-soft border border-gold/10 rounded-sm overflow-hidden">
        {artwork.thumbnailUrl && !inaccessible ? (
          <img
            src={artwork.thumbnailUrl}
            alt={artwork.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          /* Placeholder / private locked state */
          <div className="w-full h-full bg-ink-soft flex items-center justify-center">
            {inaccessible && artwork.thumbnailUrl ? (
              <>
                <img
                  src={artwork.thumbnailUrl}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover blur-md scale-105 opacity-30"
                />
                <div className="absolute inset-0 bg-ink/70 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                  <span className="text-gold text-2xl opacity-70">🔒</span>
                  <p className="font-display italic text-parchment-dim text-[0.8rem] text-center max-w-[140px] leading-snug">
                    Private section
                  </p>
                </div>
              </>
            ) : (
              <div className="font-display italic text-[0.7rem] text-stone-light tracking-[0.06em]">
                Duseum
              </div>
            )}
          </div>
        )}

        {/* PRIVATE badge overlay */}
        {artwork.accessTier === 'PRIVATE' && !inaccessible && (
          <span className="absolute top-3 right-3 text-[0.6rem] uppercase tracking-[0.14em] font-medium text-stone-light bg-ink/80 border border-gold/15 px-2 py-0.5 rounded-sm backdrop-blur-sm">
            Private
          </span>
        )}

        {/* Hover stats overlay */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 to-transparent px-4 pt-8 pb-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="flex items-center gap-3 text-[0.75rem] text-parchment-dim font-light">
            {totalReactions > 0 && (
              <span>{totalReactions} {REACTION_ICONS.LOVE}</span>
            )}
            {artwork.commentCount > 0 && (
              <span>{artwork.commentCount} comments</span>
            )}
            <span className="ml-auto">{artwork.viewCount.toLocaleString()} views</span>
          </div>
        </div>
      </div>

      {/* Metadata */}
      <div className="mt-3 px-0.5">
        <h3 className="font-display text-[1rem] font-semibold text-warm-white leading-snug truncate group-hover:text-gold-light transition-colors duration-200">
          {artwork.title}
        </h3>
        <p className="mt-0.5 text-[0.78rem] font-light text-stone-light truncate">
          {artwork.authorDisplayName}
        </p>
      </div>
    </Link>
  )
}
