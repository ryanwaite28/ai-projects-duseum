// FR-DISC-08 — Browse Atrium page
// /browse — landing page with three navigable lanes: Art Pieces, Authors, Collections.
// Each lane links to its dedicated page. No tabs, no data fetching.

import { Link } from 'react-router-dom'
import { EyebrowLabel } from '../components/ui/EyebrowLabel'
import { PageLayout } from '../components/layout/PageLayout'
import { useReveal } from '../hooks/use-reveal'

interface LaneCard {
  eyebrow: string
  title:   string
  description: string
  href:    string
  cta:     string
}

const LANES: LaneCard[] = [
  {
    eyebrow:     'Gallery',
    title:       'Art Pieces',
    description: 'Discover works from independent artists across every medium — painting, digital, photography, and more.',
    href:        '/browse/pieces',
    cta:         'Browse pieces',
  },
  {
    eyebrow:     'Directory',
    title:       'Authors',
    description: 'Explore the artists behind the work. Follow the ones who move you and subscribe to unlock their private collections.',
    href:        '/authors',
    cta:         'Browse authors',
  },
  {
    eyebrow:     'Curated Series',
    title:       'Collections',
    description: 'Hand-picked series of works curated by artists themselves — free to explore, subscriber-only collections await.',
    href:        '/browse/collections',
    cta:         'Browse collections',
  },
]

export default function BrowseAtriumPage() {
  const ref = useReveal<HTMLElement>()

  return (
    <PageLayout>
      {/* Hero */}
      <section className="relative py-36 px-8 bg-ink text-center overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(200,151,58,0.07) 0%, transparent 70%)',
          }}
        />
        <div className="relative z-10 max-w-[680px] mx-auto">
          <EyebrowLabel>The Museum</EyebrowLabel>
          <h1 className="font-display text-[clamp(2.8rem,7vw,5rem)] font-normal text-warm-white leading-[1.08] mt-2">
            Where would you<br />
            <em className="italic text-gold-light">like to explore?</em>
          </h1>
          <p className="mt-6 text-[0.95rem] font-light text-stone-light leading-[1.8] max-w-[480px] mx-auto">
            Duseum is home to independent artists and their work. Choose a wing to begin.
          </p>
        </div>
      </section>

      {/* Lane cards */}
      <section
        ref={ref}
        className="py-20 px-8 bg-ink-soft border-t border-gold/10"
      >
        <div className="max-w-[1100px] mx-auto grid grid-cols-1 md:grid-cols-3 gap-px bg-gold/10 border border-gold/10">
          {LANES.map((lane, i) => (
            <div
              key={lane.href}
              className="relative bg-ink-soft p-10 overflow-hidden group transition-colors duration-300 hover:bg-gold/[0.03] flex flex-col"
              style={{ animationDelay: `${i * 0.08}s` }}
            >
              {/* Gold top-border reveal on hover */}
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gold scale-x-0 group-hover:scale-x-100 transition-transform duration-400 origin-left" />

              <EyebrowLabel>{lane.eyebrow}</EyebrowLabel>

              <h2 className="font-display text-[1.6rem] font-normal text-warm-white leading-snug mb-4">
                {lane.title}
              </h2>

              <p className="text-[0.88rem] font-light text-stone-light leading-[1.75] mb-8 flex-1">
                {lane.description}
              </p>

              <Link
                to={lane.href}
                className="inline-flex items-center gap-2 bg-transparent border border-gold/25 hover:border-gold/60 text-parchment-dim hover:text-warm-white font-body text-sm font-light uppercase tracking-[0.04em] px-6 py-[0.75rem] rounded-sm transition-colors duration-150 self-start"
              >
                {lane.cta}
                <span aria-hidden className="text-gold">→</span>
              </Link>
            </div>
          ))}
        </div>
      </section>
    </PageLayout>
  )
}
