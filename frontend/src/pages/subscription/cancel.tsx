import { Link } from 'react-router-dom'
import { PageLayout } from '../../components/layout/PageLayout'
import { EyebrowLabel } from '../../components/ui/EyebrowLabel'
import { Button } from '../../components/ui/Button'

export default function SubscriptionCancelPage() {
  return (
    <PageLayout>
      <section className="min-h-screen py-32 px-8 bg-ink flex items-center justify-center">
        <div className="text-center max-w-md">
          <EyebrowLabel>Subscription</EyebrowLabel>
          <h1 className="font-display text-[clamp(2rem,4vw,2.8rem)] font-normal text-warm-white leading-[1.12] mb-4">
            Checkout cancelled
          </h1>
          <p className="text-[0.92rem] font-light text-stone-light leading-[1.8] mb-10">
            No charge was made. You can subscribe whenever you're ready.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/browse">
              <Button variant="secondary">Back to gallery</Button>
            </Link>
            <Link to="/subscriptions">
              <Button variant="primary">View plans</Button>
            </Link>
          </div>
        </div>
      </section>
    </PageLayout>
  )
}
