import { cn } from '../../lib/utils'
import { ArtworkCard } from './ArtworkCard'
import { LockedArtworkCard } from './LockedArtworkCard'
import type { ArtworkListItem } from '../../types/artwork'

interface ArtworkGridProps {
  items:     ArtworkListItem[]
  className?: string
}

export const ArtworkGrid = ({ items, className }: ArtworkGridProps) => (
  <div
    className={cn(
      'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6',
      className
    )}
  >
    {items.map((artwork) =>
      artwork.accessTier === 'REQUIRES_PLATFORM_SUB' ? (
        <LockedArtworkCard key={artwork.artworkId} artwork={artwork} />
      ) : (
        <ArtworkCard
          key={artwork.artworkId}
          artwork={artwork}
          // Pass authorId in router state so detail page can use it for upsell
          linkState={{ authorId: artwork.authorId }}
        />
      )
    )}
  </div>
)

// ── Skeleton loader ───────────────────────────────────────────────────────────

export const ArtworkGridSkeleton = ({ count = 8 }: { count?: number }) => (
  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="animate-pulse">
        <div className="aspect-[4/5] bg-ink-soft border border-gold/10 rounded-sm" />
        <div className="mt-3 h-4 bg-ink-soft rounded-sm w-3/4" />
        <div className="mt-2 h-3 bg-ink-soft rounded-sm w-1/2" />
      </div>
    ))}
  </div>
)
