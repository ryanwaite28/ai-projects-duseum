import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button } from '../ui/Button'
import { subscriptionsService } from '../../services/subscriptions.service'
import type { ApiError } from '../../services/api'

interface Props {
  className?: string
}

export function PlatformSubscribeCTA({ className }: Props) {
  const [error, setError] = useState<string | null>(null)

  const upgradeMutation = useMutation({
    mutationFn: () => subscriptionsService.createPlatformCheckout(),
    onSuccess:  (data) => { window.location.href = data.checkoutUrl },
    onError:    (err: ApiError) => setError(err.message ?? 'Could not start checkout.'),
  })

  return (
    <div className={className}>
      <div className="bg-ink border border-gold/15 rounded-sm p-6 flex items-center justify-between gap-6">
        <div>
          <p className="text-[0.72rem] font-medium tracking-[0.14em] uppercase text-stone-light mb-1">Free tier</p>
          <p className="text-[0.88rem] font-light text-stone-light">
            Upgrade to unlock the full collection.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => { setError(null); upgradeMutation.mutate() }}
          disabled={upgradeMutation.isPending}
        >
          {upgradeMutation.isPending ? '…' : 'Upgrade'}
        </Button>
      </div>
      {error && (
        <p className="mt-2 text-[0.72rem] text-[#c0544a]">{error}</p>
      )}
    </div>
  )
}
