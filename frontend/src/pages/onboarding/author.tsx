import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { PageLayout } from '../../components/layout/PageLayout'
import { EyebrowLabel } from '../../components/ui/EyebrowLabel'
import { GoldDivider } from '../../components/ui/GoldDivider'
import { Button } from '../../components/ui/Button'
import { api } from '../../services/api'
import { useMeQueryKey } from '../../hooks/use-me'
import { cn } from '../../lib/utils'

interface CreateAuthorPayload {
  displayName: string
  bio: string
  authorSubscriptionPriceUsd?: number
}

// ── Step indicators ───────────────────────────────────────────────────────────

function StepIndicator({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-10">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className={cn(
            'w-6 h-6 rounded-full border flex items-center justify-center text-[0.65rem] font-medium transition-colors duration-200',
            i + 1 <= step
              ? 'border-gold bg-gold/20 text-gold'
              : 'border-gold/20 text-stone-light',
          )}>
            {i + 1}
          </div>
          {i < total - 1 && (
            <div className={cn(
              'w-12 h-px transition-colors duration-200',
              i + 1 < step ? 'bg-gold/40' : 'bg-gold/10',
            )} />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Step 1 — Profile info ─────────────────────────────────────────────────────

interface Step1Props {
  displayName: string
  bio: string
  onChange: (field: 'displayName' | 'bio', value: string) => void
  onNext: () => void
}

function Step1({ displayName, bio, onChange, onNext }: Step1Props) {
  const canContinue = displayName.trim().length >= 1 && bio.trim().length >= 10

  return (
    <div>
      <p className="text-[0.72rem] font-medium tracking-[0.14em] uppercase text-stone-light mb-8">
        Step 1 of 2 — Profile
      </p>

      <div className="space-y-6 mb-10">
        <div>
          <label className="block text-[0.78rem] font-medium text-parchment-dim mb-2 tracking-[0.04em]">
            Display name <span className="text-gold">*</span>
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => onChange('displayName', e.target.value)}
            maxLength={100}
            placeholder="How you'll appear to visitors"
            className="w-full bg-ink-soft border border-gold/20 text-parchment placeholder:text-stone-light/40 text-[0.88rem] font-light px-4 py-3 rounded-sm outline-none focus:border-gold/50 transition-colors duration-150"
          />
        </div>

        <div>
          <label className="block text-[0.78rem] font-medium text-parchment-dim mb-2 tracking-[0.04em]">
            Bio <span className="text-gold">*</span>
          </label>
          <textarea
            value={bio}
            onChange={(e) => onChange('bio', e.target.value)}
            maxLength={2000}
            rows={5}
            placeholder="Tell visitors about yourself and your work…"
            className="w-full bg-ink-soft border border-gold/20 text-parchment placeholder:text-stone-light/40 text-[0.88rem] font-light px-4 py-3 rounded-sm outline-none focus:border-gold/50 transition-colors duration-150 resize-none"
          />
          <p className="text-[0.68rem] font-light text-stone-light mt-1 text-right">
            {bio.length}/2000
          </p>
        </div>
      </div>

      <Button variant="primary" onClick={onNext} disabled={!canContinue}>
        Continue →
      </Button>
    </div>
  )
}

// ── Step 2 — Subscription price + confirm ─────────────────────────────────────

interface Step2Props {
  displayName: string
  bio: string
  priceUsd: string
  onPriceChange: (v: string) => void
  onBack: () => void
  onSubmit: () => void
  isSubmitting: boolean
  error: string | null
}

function Step2({ displayName, bio, priceUsd, onPriceChange, onBack, onSubmit, isSubmitting, error }: Step2Props) {
  const parsedPrice = parseFloat(priceUsd)
  const priceValid = priceUsd === '' || (!isNaN(parsedPrice) && parsedPrice >= 1 && parsedPrice <= 50)

  return (
    <div>
      <p className="text-[0.72rem] font-medium tracking-[0.14em] uppercase text-stone-light mb-8">
        Step 2 of 2 — Subscription pricing
      </p>

      {/* Summary */}
      <div className="bg-ink-soft border border-gold/15 rounded-sm p-5 mb-8">
        <p className="text-[0.72rem] font-medium tracking-[0.12em] uppercase text-stone-light mb-3">Profile summary</p>
        <p className="text-[0.92rem] font-medium text-parchment mb-1">{displayName}</p>
        <p className="text-[0.82rem] font-light text-stone-light line-clamp-2">{bio}</p>
      </div>

      {/* Optional price */}
      <div className="mb-8">
        <label className="block text-[0.78rem] font-medium text-parchment-dim mb-2 tracking-[0.04em]">
          Monthly subscription price (USD) <span className="text-stone-light font-light">— optional</span>
        </label>
        <p className="text-[0.75rem] font-light text-stone-light mb-3">
          Subscribers can unlock your private pieces. You can update this anytime. Must be $1–$50.
        </p>
        <div className="relative w-40">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-light text-[0.88rem]">$</span>
          <input
            type="number"
            value={priceUsd}
            onChange={(e) => onPriceChange(e.target.value)}
            min={1}
            max={50}
            step={1}
            placeholder="e.g. 5"
            className={cn(
              'w-full bg-ink-soft border text-parchment text-[0.88rem] font-light pl-7 pr-4 py-3 rounded-sm outline-none transition-colors duration-150',
              priceValid ? 'border-gold/20 focus:border-gold/50' : 'border-[#c0544a]/50 focus:border-[#c0544a]',
            )}
          />
        </div>
        {!priceValid && (
          <p className="text-[0.72rem] text-[#c0544a] mt-1">Must be between $1 and $50.</p>
        )}
      </div>

      {error && (
        <div className="mb-6 px-4 py-3 bg-[#c0544a]/10 border border-[#c0544a]/30 rounded-sm text-[0.82rem] font-body text-[#c0544a]">
          {error}
        </div>
      )}

      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="text-[0.82rem] font-light text-stone-light hover:text-parchment transition-colors duration-150"
        >
          ← Back
        </button>
        <Button
          variant="primary"
          onClick={onSubmit}
          disabled={isSubmitting || !priceValid}
        >
          {isSubmitting ? 'Creating profile…' : 'Create author profile'}
        </Button>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

function AuthorOnboardingContent() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [step, setStep] = useState(1)
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [priceUsd, setPriceUsd] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleChange = (field: 'displayName' | 'bio', value: string) => {
    if (field === 'displayName') setDisplayName(value)
    else setBio(value)
  }

  const createMutation = useMutation({
    mutationFn: (payload: CreateAuthorPayload) =>
      api.post('/users/me/author', payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: useMeQueryKey })
      navigate('/dashboard/author')
    },
    onError: (err: Error) => {
      setError(err.message ?? 'Failed to create author profile. Please try again.')
    },
  })

  const handleSubmit = () => {
    setError(null)
    const parsedPrice = parseFloat(priceUsd)
    const payload: CreateAuthorPayload = {
      displayName: displayName.trim(),
      bio: bio.trim(),
    }
    if (priceUsd !== '' && !isNaN(parsedPrice)) {
      payload.authorSubscriptionPriceUsd = parsedPrice
    }
    createMutation.mutate(payload)
  }

  return (
    <PageLayout>
      <section className="min-h-screen py-32 px-8 bg-ink">
        <div className="max-w-[600px] mx-auto">
          <EyebrowLabel>Become an Author</EyebrowLabel>
          <h1 className="font-display text-[clamp(2rem,4vw,3rem)] font-normal text-warm-white leading-[1.12] mb-2">
            Author<br />
            <em className="italic text-gold-light">onboarding</em>
          </h1>
          <GoldDivider />

          <StepIndicator step={step} total={2} />

          {step === 1 && (
            <Step1
              displayName={displayName}
              bio={bio}
              onChange={handleChange}
              onNext={() => setStep(2)}
            />
          )}

          {step === 2 && (
            <Step2
              displayName={displayName}
              bio={bio}
              priceUsd={priceUsd}
              onPriceChange={setPriceUsd}
              onBack={() => setStep(1)}
              onSubmit={handleSubmit}
              isSubmitting={createMutation.isPending}
              error={error}
            />
          )}
        </div>
      </section>
    </PageLayout>
  )
}

export default function AuthorOnboardingPage() {
  return <AuthorOnboardingContent />
}
