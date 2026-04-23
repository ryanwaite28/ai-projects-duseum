import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageLayout } from '../../components/layout/PageLayout'
import { EyebrowLabel } from '../../components/ui/EyebrowLabel'
import { useSubscriptions } from '../../hooks/use-subscriptions'

export default function SubscriptionSuccessPage() {
  const navigate = useNavigate()
  const { hasPlatformSub, isLoading, refetch } = useSubscriptions()

  useEffect(() => {
    const interval = setInterval(() => {
      refetch()
    }, 2_000)
    return () => clearInterval(interval)
  }, [refetch])

  useEffect(() => {
    if (hasPlatformSub) {
      const t = setTimeout(() => navigate('/browse'), 2_500)
      return () => clearTimeout(t)
    }
  }, [hasPlatformSub, navigate])

  return (
    <PageLayout>
      <section className="min-h-screen py-32 px-8 bg-ink flex items-center justify-center">
        <div className="text-center max-w-md">
          <EyebrowLabel>Subscription</EyebrowLabel>
          {hasPlatformSub ? (
            <>
              <h1 className="font-display text-[clamp(2rem,4vw,2.8rem)] font-normal text-warm-white leading-[1.12] mb-4">
                Welcome to Duseum
              </h1>
              <p className="text-[0.92rem] font-light text-stone-light leading-[1.8]">
                Your subscription is active. Redirecting to the gallery…
              </p>
            </>
          ) : (
            <>
              <h1 className="font-display text-[clamp(2rem,4vw,2.8rem)] font-normal text-warm-white leading-[1.12] mb-4">
                Activating your plan
              </h1>
              <p className="text-[0.92rem] font-light text-stone-light leading-[1.8]">
                {isLoading ? 'Confirming your subscription…' : 'Waiting for confirmation from Stripe…'}
              </p>
              <div className="mt-8 flex justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-gold animate-float" />
              </div>
            </>
          )}
        </div>
      </section>
    </PageLayout>
  )
}
