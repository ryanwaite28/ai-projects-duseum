import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { cn } from '../../lib/utils'
import { useAuthStore } from '../../store/auth.store'
import { subscriptionsService } from '../../services/subscriptions.service'
import type { ArtworkListItem } from '../../types/artwork'
import type { ApiError } from '../../services/api'

interface LockedArtworkCardProps {
  artwork:    ArtworkListItem
  className?: string
}

export const LockedArtworkCard = ({ artwork, className }: LockedArtworkCardProps) => {
  const { user } = useAuthStore()
  const navigate  = useNavigate()
  const [ctaError, setCtaError] = useState<string | null>(null)

  const checkoutMutation = useMutation({
    mutationFn: () => subscriptionsService.createPlatformCheckout(),
    onSuccess:  (data) => { window.location.href = data.checkoutUrl },
    onError:    (err: ApiError) => setCtaError(err.message ?? 'Could not start checkout.'),
  })

  const handleSubscribe = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!user) {
      navigate(`/login?return=/browse`)
      return
    }
    setCtaError(null)
    checkoutMutation.mutate()
  }

  return (
    <div className={cn('block', className)}>
      {/* Image frame — locked overlay */}
      <div className="relative aspect-[4/5] bg-ink-soft border border-gold/10 rounded-sm overflow-hidden">
        {/* Blurred placeholder */}
        <div className="absolute inset-0 bg-gradient-to-br from-ink-soft to-ink" />
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{ backgroundImage: 'radial-gradient(circle at 40% 60%, rgba(200,151,58,0.4) 0%, transparent 60%)' }}
        />

        {/* Lock overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4">
          <span className="text-gold/50 text-2xl select-none">🔒</span>
          <p className="font-display italic text-parchment-dim text-[0.72rem] text-center leading-snug">
            Beyond free tier
          </p>
          <button
            onClick={handleSubscribe}
            disabled={checkoutMutation.isPending}
            className="mt-1 bg-gold hover:bg-gold-light text-ink font-body text-[0.68rem] font-medium uppercase tracking-[0.12em] px-4 py-[0.45rem] rounded-sm transition-colors duration-150 hover:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0 whitespace-nowrap"
          >
            {checkoutMutation.isPending ? '…' : 'Unlock all'}
          </button>
          {ctaError && (
            <p className="text-[0.65rem] text-[#c0544a] text-center mt-1">{ctaError}</p>
          )}
        </div>
      </div>

      {/* Metadata */}
      <div className="mt-3 px-0.5">
        <h3 className="font-display text-[1rem] font-semibold text-parchment-dim leading-snug truncate">
          {artwork.title}
        </h3>
        <p className="mt-0.5 text-[0.78rem] font-light text-stone-light truncate opacity-60">
          {artwork.category.replace('_', ' ').toLowerCase()}
        </p>
      </div>
    </div>
  )
}
