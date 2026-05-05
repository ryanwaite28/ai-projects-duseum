// FR-COL-08 — Collection Detail page
// /collections/:collectionId
//
// FREE collections: pieces visible to all (individual piece access rules apply).
// SUBSCRIBER_ONLY: gate UI for non-subscribers with CTA to author's profile.
// Backend always returns metadata + access field, so no second API call needed.

import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { EyebrowLabel } from '../components/ui/EyebrowLabel'
import { PageLayout } from '../components/layout/PageLayout'
import { ArtworkGrid } from '../components/artwork/ArtworkGrid'
import { collectionsService } from '../services/collections.service'
import { useReveal } from '../hooks/use-reveal'

// ── Subcomponents ─────────────────────────────────────────────────────────────

function LockSvg() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-10 h-10 text-gold opacity-60"
      aria-hidden
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

interface GatedViewProps {
  title:       string
  description: string | null
  ownerId:     string
  authRequired: boolean
}

function GatedView({ title, description, ownerId, authRequired }: GatedViewProps) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-8 py-24 gap-6">
      <LockSvg />

      <div className="max-w-[440px]">
        <p className="text-[0.68rem] font-medium tracking-[0.2em] uppercase text-gold mb-3">
          Subscriber Only
        </p>
        <h2 className="font-display text-[1.6rem] font-normal text-warm-white mb-3 leading-snug">
          {title}
        </h2>
        {description && (
          <p className="text-[0.88rem] font-light text-stone-light leading-[1.75] mb-6">
            {description}
          </p>
        )}
        <p className="text-[0.85rem] font-light text-parchment-dim leading-[1.7] mb-8">
          {authRequired
            ? 'Sign in and subscribe to this author to view this collection.'
            : 'This is a subscriber-only collection. Subscribe to this author to unlock it.'}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-3">
        <Link
          to={`/authors/${ownerId}`}
          className="inline-flex items-center gap-2 bg-gold hover:bg-gold-light text-ink font-body text-sm font-medium uppercase tracking-[0.04em] px-8 py-[0.9rem] rounded-sm transition-colors duration-150 hover:-translate-y-px"
        >
          View author &amp; subscribe
        </Link>
        {authRequired && (
          <Link
            to="/login"
            className="inline-flex items-center gap-2 bg-transparent border border-gold/25 hover:border-gold/60 text-parchment-dim hover:text-warm-white font-body text-sm font-light uppercase tracking-[0.04em] px-8 py-[0.9rem] rounded-sm transition-colors duration-200"
          >
            Sign in
          </Link>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CollectionDetailPage() {
  const { collectionId } = useParams<{ collectionId: string }>()
  const ref = useReveal<HTMLElement>()

  const { data, isLoading, isError } = useQuery({
    queryKey:  ['collections', collectionId],
    queryFn:   () => collectionsService.getById(collectionId!),
    enabled:   !!collectionId,
    staleTime: 2 * 60_000,
  })

  if (isLoading) {
    return (
      <PageLayout>
        <div className="min-h-screen bg-ink flex items-center justify-center">
          <div className="w-1.5 h-1.5 rounded-full bg-gold animate-float" />
        </div>
      </PageLayout>
    )
  }

  if (isError || !data) {
    return (
      <PageLayout>
        <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-8 gap-4">
          <p className="text-[0.88rem] text-stone-light">Collection not found.</p>
          <Link to="/browse/collections" className="text-[0.82rem] text-gold hover:text-gold-light underline underline-offset-4">
            Browse all collections
          </Link>
        </div>
      </PageLayout>
    )
  }

  const isGranted = data.access === 'GRANTED'

  return (
    <PageLayout>
      {/* Hero */}
      <section className="relative py-32 px-8 bg-ink text-center overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 60% 55% at 50% 40%, rgba(200,151,58,0.06) 0%, transparent 70%)',
          }}
        />
        <div className="relative z-10 max-w-[700px] mx-auto">
          <EyebrowLabel>
            {data.visibility === 'FREE' ? 'Free Collection' : 'Subscriber Collection'}
          </EyebrowLabel>

          <h1 className="font-display text-[clamp(2rem,5vw,3.6rem)] font-normal text-warm-white leading-[1.1] mt-2">
            {data.title}
          </h1>

          {data.description && (
            <p className="mt-5 text-[0.95rem] font-light text-stone-light leading-[1.8] max-w-[520px] mx-auto">
              {data.description}
            </p>
          )}

          {isGranted && (
            <p className="mt-4 text-[0.72rem] font-medium tracking-[0.14em] uppercase text-stone-light">
              {data.visiblePieceCount} of {data.totalPieceCount} piece{data.totalPieceCount !== 1 ? 's' : ''} visible to you
            </p>
          )}
        </div>
      </section>

      {/* Content */}
      {isGranted ? (
        <section ref={ref} className="reveal py-20 px-8 bg-ink-soft border-t border-gold/10">
          <div className="max-w-[1100px] mx-auto">
            {data.pieces.length === 0 ? (
              <p className="text-center text-[0.88rem] text-stone-light py-12">
                No pieces are visible to you in this collection yet.
              </p>
            ) : (
              <ArtworkGrid items={data.pieces} />
            )}
          </div>
        </section>
      ) : (
        <section className="bg-ink-soft border-t border-gold/10">
          <GatedView
            title={data.title}
            description={data.description}
            ownerId={data.ownerId}
            authRequired={data.access === 'AUTH_REQUIRED'}
          />
        </section>
      )}
    </PageLayout>
  )
}
