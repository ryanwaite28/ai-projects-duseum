import { useNavigate } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { useAuthStore } from '../../store/auth.store'
import { useUpsertReaction, useDeleteReaction } from '../../hooks/use-reactions'
import type { ReactionType } from '../../types/artwork'
import type { Artwork } from '../../types/artwork'

const REACTIONS: { type: ReactionType; label: string; emoji: string }[] = [
  { type: 'LOVE',     label: 'Love',     emoji: '♥' },
  { type: 'WOW',      label: 'Wow',      emoji: '✦' },
  { type: 'FIRE',     label: 'Fire',     emoji: '🔥' },
  { type: 'INSPIRED', label: 'Inspired', emoji: '✸' },
]

interface ReactionBarProps {
  artwork:          Artwork
  activeReaction?:  ReactionType | null
  className?:       string
}

export const ReactionBar = ({ artwork, activeReaction, className }: ReactionBarProps) => {
  const { user }   = useAuthStore()
  const navigate   = useNavigate()
  const upsert     = useUpsertReaction(artwork.artworkId)
  const remove     = useDeleteReaction(artwork.artworkId)

  const handleClick = (type: ReactionType) => {
    if (!user) {
      navigate(`/login?return=/artworks/${artwork.artworkId}`)
      return
    }
    if (activeReaction === type) {
      remove.mutate()
    } else {
      upsert.mutate(type)
    }
  }

  return (
    <div className={cn('grid grid-cols-2 gap-2', className)}>
      {REACTIONS.map(({ type, label, emoji }) => {
        const isActive = activeReaction === type
        const count    = artwork.reactionCounts[type] ?? 0

        return (
          <button
            key={type}
            onClick={() => handleClick(type)}
            disabled={upsert.isPending || remove.isPending}
            className={cn(
              'flex items-center justify-between gap-2 px-4 py-2.5 rounded-sm text-[0.78rem] font-light transition-all duration-200 border',
              isActive
                ? 'bg-gold/10 border-gold/60 text-warm-white'
                : 'bg-ink-soft border-gold/15 hover:border-gold/35 hover:bg-gold/5 text-parchment-dim hover:text-warm-white',
            )}
          >
            <span>{emoji}&nbsp;&nbsp;{label}</span>
            <span className={cn('tabular-nums', isActive ? 'text-gold' : 'text-stone-light')}>
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
}
