import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Button } from '../ui/Button'
import { useAuthStore } from '../../store/auth.store'
import { subscriptionsService } from '../../services/subscriptions.service'
import type { ApiError } from '../../services/api'

interface Props {
  authorId:                   string
  authorDisplayName:          string
  priceUsd:                   number
  connectChargesEnabled:      boolean | null
  alreadySubscribed:          boolean
  className?:                 string
}

export function AuthorSubscribeCTA({
  authorId,
  authorDisplayName,
  priceUsd,
  connectChargesEnabled,
  alreadySubscribed,
  className,
}: Props) {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [error, setError] = useState<string | null>(null)

  const checkoutMutation = useMutation({
    mutationFn: () => subscriptionsService.createAuthorCheckout(authorId),
    onSuccess:  (data) => { window.location.href = data.checkoutUrl },
    onError:    (err: ApiError) => setError(err.message ?? 'Could not start checkout.'),
  })

  // Only render when the author has payouts enabled and a price set
  if (connectChargesEnabled !== true) return null

  const handleSubscribe = () => {
    if (!user) {
      navigate(`/login?return=/authors/${authorId}`)
      return
    }
    setError(null)
    checkoutMutation.mutate()
  }

  return (
    <div className={className}>
      {alreadySubscribed ? (
        <Button variant="secondary" className="w-full justify-center" disabled>
          Already subscribed
        </Button>
      ) : (
        <Button
          variant="primary"
          className="w-full justify-center"
          onClick={handleSubscribe}
          disabled={checkoutMutation.isPending}
        >
          {checkoutMutation.isPending ? '…' : `Subscribe · $${priceUsd}/mo`}
        </Button>
      )}
      {error && (
        <p className="mt-2 text-[0.72rem] text-[#c0544a] text-center">{error}</p>
      )}
      {!alreadySubscribed && (
        <p className="mt-3 text-[0.72rem] font-light text-stone-light text-center leading-relaxed">
          Unlock {authorDisplayName}'s private gallery + direct support
        </p>
      )}
    </div>
  )
}
