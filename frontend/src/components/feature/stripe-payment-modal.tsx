import { useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string)

const stripeAppearance = {
  theme: 'night' as const,
  variables: {
    colorPrimary:    '#c8973a',
    colorBackground: '#1c1a16',
    colorText:       '#f5f0e8',
    colorDanger:     '#c0544a',
    fontFamily:      'DM Sans, sans-serif',
    borderRadius:    '2px',
  },
}

interface PaymentFormProps {
  bookingId:    string
  isoWeek:      string
  amountUsd:    number
  onCancel:     () => void
}

const PaymentForm = ({ bookingId, isoWeek, amountUsd, onCancel }: PaymentFormProps) => {
  const stripe   = useStripe()
  const elements = useElements()
  const [error,  setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setLoading(true)
    setError(null)

    const returnUrl = `${window.location.origin}/dashboard?feature=booking-success&bookingId=${bookingId}&week=${isoWeek}`

    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
    })

    if (stripeError) {
      setError(stripeError.message ?? 'Payment failed. Please try again.')
      setLoading(false)
    }
    // On success Stripe redirects — no further action needed here
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="bg-ink border border-gold/10 p-5 rounded-sm">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[0.68rem] font-medium tracking-[0.2em] uppercase text-gold">
            Weekly Feature — {isoWeek}
          </p>
          <p className="font-display text-xl text-warm-white">${amountUsd}</p>
        </div>
        <PaymentElement />
      </div>

      {error && (
        <p className="text-[0.82rem] text-[#c0544a] font-body">{error}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading || !stripe}
          className="bg-gold hover:bg-gold-light text-ink font-body text-sm font-medium uppercase tracking-[0.04em] px-8 py-[0.9rem] rounded-sm transition-colors duration-150 hover:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0"
        >
          {loading ? 'Processing…' : `Pay $${amountUsd}`}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="bg-transparent border border-gold/25 hover:border-gold/60 text-parchment-dim hover:text-warm-white font-body text-sm font-light uppercase tracking-[0.04em] px-6 py-[0.9rem] rounded-sm transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

interface StripePaymentModalProps {
  clientSecret: string
  bookingId:    string
  isoWeek:      string
  amountUsd:    number
  onCancel:     () => void
}

export const StripePaymentModal = ({
  clientSecret,
  bookingId,
  isoWeek,
  amountUsd,
  onCancel,
}: StripePaymentModalProps) => (
  <Elements
    stripe={stripePromise}
    options={{ clientSecret, appearance: stripeAppearance }}
  >
    <PaymentForm
      bookingId={bookingId}
      isoWeek={isoWeek}
      amountUsd={amountUsd}
      onCancel={onCancel}
    />
  </Elements>
)
