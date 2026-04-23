import { useState } from 'react'
import { EyebrowLabel } from '../../components/ui/EyebrowLabel'
import { PageLayout } from '../../components/layout/PageLayout'
import { ProtectedRoute } from '../../components/layout/ProtectedRoute'
import { useMe } from '../../hooks/use-me'
import { OverviewTab }       from './tabs/overview-tab'
import { PiecesTab }         from './tabs/pieces-tab'
import { CollectionsTab }    from './tabs/collections-tab'
import { PinnedTab }         from './tabs/pinned-tab'
import { AnalyticsTab }      from './tabs/analytics-tab'
import { FeatureHistoryTab } from './tabs/feature-history-tab'

// ── Tab config ────────────────────────────────────────────────────────────────

type TabId = 'overview' | 'pieces' | 'collections' | 'pinned' | 'analytics' | 'features'

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview',     label: 'Overview'     },
  { id: 'pieces',       label: 'My Pieces'    },
  { id: 'collections',  label: 'Collections'  },
  { id: 'pinned',       label: 'Pinned Pieces' },
  { id: 'analytics',    label: 'Analytics'    },
  { id: 'features',     label: 'Feature Slots' },
]

// ── Tab bar ───────────────────────────────────────────────────────────────────

function TabBar({ active, onChange }: { active: TabId; onChange: (id: TabId) => void }) {
  return (
    <div className="border-b border-gold/10 mb-8 overflow-x-auto">
      <div className="flex gap-0 min-w-max">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`px-5 py-3 text-[0.78rem] font-medium tracking-[0.06em] uppercase transition-colors whitespace-nowrap border-b-2 -mb-px ${
              active === tab.id
                ? 'border-gold text-gold'
                : 'border-transparent text-stone-light hover:text-parchment'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Page content ──────────────────────────────────────────────────────────────

function AuthorDashboardContent() {
  const { data: me, isLoading } = useMe()
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="w-1.5 h-1.5 rounded-full bg-gold animate-float" />
      </div>
    )
  }

  if (!me?.authorProfile) {
    return (
      <div className="py-24 text-center">
        <p className="text-stone-light font-body text-sm">You do not have an Author profile yet.</p>
      </div>
    )
  }

  return (
    <>
      <TabBar active={activeTab} onChange={setActiveTab} />
      {activeTab === 'overview'    && <OverviewTab />}
      {activeTab === 'pieces'      && <PiecesTab />}
      {activeTab === 'collections' && <CollectionsTab />}
      {activeTab === 'pinned'      && <PinnedTab />}
      {activeTab === 'analytics'   && <AnalyticsTab />}
      {activeTab === 'features'    && <FeatureHistoryTab />}
    </>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AuthorDashboardAuthorPage() {
  return (
    <ProtectedRoute>
      <PageLayout>
        <section className="min-h-screen py-32 px-8 bg-ink">
          <div className="max-w-[900px] mx-auto">
            <div className="mb-10">
              <EyebrowLabel>Author Tools</EyebrowLabel>
              <h1 className="font-display text-[clamp(2rem,4vw,3rem)] font-normal text-warm-white leading-[1.12]">
                Creator<br />
                <em className="italic text-gold-light">Dashboard</em>
              </h1>
            </div>
            <AuthorDashboardContent />
          </div>
        </section>
      </PageLayout>
    </ProtectedRoute>
  )
}
