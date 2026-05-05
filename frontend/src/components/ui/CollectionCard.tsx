// FR-COL-07, FR-DISC-06, FR-DISC-07, FR-COL-08
// Shared card used on author profile, homepage Explore Collections, and browse-collections page.
// Image priority: posterUrl → coverPieceUrl → branded placeholder.
// Links to /collections/:collectionId (FR-COL-08). Pass disableLink to suppress.

import { Link } from 'react-router-dom'

interface CollectionCardProps {
  collectionId:       string
  title:              string
  description?:       string | null
  posterUrl?:         string | null
  coverPieceUrl?:     string | null
  authorDisplayName?: string
  pieceCount?:        number
  visibility:         'FREE' | 'SUBSCRIBER_ONLY'
  /** Suppress the link wrapper (e.g. when already inside a clickable container). */
  disableLink?:       boolean
}

export function CollectionCard({
  collectionId,
  title,
  description,
  posterUrl,
  coverPieceUrl,
  authorDisplayName,
  pieceCount,
  visibility,
  disableLink = false,
}: CollectionCardProps) {
  const imageUrl = posterUrl ?? coverPieceUrl ?? null

  const inner = (
    <div className="bg-ink-soft border border-gold/10 rounded-sm overflow-hidden group hover:border-gold/25 transition-colors duration-200 h-full flex flex-col">
      {imageUrl ? (
        <div className="aspect-[16/9] overflow-hidden flex-shrink-0">
          <img
            src={imageUrl}
            alt={title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </div>
      ) : (
        <div className="aspect-[16/9] bg-ink flex items-center justify-center flex-shrink-0">
          <div className="flex flex-col items-center gap-1 opacity-30">
            <div className="w-8 h-8 border border-gold/40 rounded-sm flex items-center justify-center">
              <span className="font-display italic text-gold text-[0.65rem]">D</span>
            </div>
            <span className="font-display italic text-stone-light text-[0.6rem]">Collection</span>
          </div>
        </div>
      )}

      <div className="p-5 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-display text-[1rem] font-semibold text-warm-white leading-snug line-clamp-2">
            {title}
          </h3>
          <span className={`flex-shrink-0 text-[0.62rem] font-medium tracking-[0.16em] uppercase px-[0.6rem] py-[0.25rem] rounded-sm ${
            visibility === 'FREE'
              ? 'text-[#5a9e6e] bg-[#5a9e6e]/12'
              : 'text-gold bg-gold/12'
          }`}>
            {visibility === 'FREE' ? 'Free' : 'Subscribers'}
          </span>
        </div>

        {description && (
          <p className="text-[0.78rem] font-light text-stone-light line-clamp-2 mb-2">{description}</p>
        )}

        <div className="mt-auto pt-2 flex items-center justify-between text-[0.68rem] text-stone-light">
          {authorDisplayName && (
            <span className="truncate">{authorDisplayName}</span>
          )}
          {pieceCount !== undefined && (
            <span className="flex-shrink-0 ml-auto">
              {pieceCount} piece{pieceCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  )

  if (disableLink) return <div key={collectionId}>{inner}</div>

  return (
    <Link
      key={collectionId}
      to={`/collections/${collectionId}`}
      className="block no-underline h-full"
    >
      {inner}
    </Link>
  )
}
