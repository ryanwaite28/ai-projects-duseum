import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { connectStatusQueryKey } from '../../hooks/use-connect-status'
import { EyebrowLabel }       from '../../components/ui/EyebrowLabel'
import { PageLayout }         from '../../components/layout/PageLayout'
import { ProtectedRoute }     from '../../components/layout/ProtectedRoute'
import { useMe }              from '../../hooks/use-me'
import { OverviewTab }        from './tabs/overview-tab'
import { PiecesTab }          from './tabs/pieces-tab'
import { CollectionsTab }     from './tabs/collections-tab'
import { PinnedTab }          from './tabs/pinned-tab'
import { AnalyticsTab }       from './tabs/analytics-tab'
import { FeatureHistoryTab }  from './tabs/feature-history-tab'
import { authorDashboardService } from '../../services/author-dashboard.service'

// ── Tab config ────────────────────────────────────────────────────────────────

type TabId = 'overview' | 'pieces' | 'collections' | 'pinned' | 'analytics' | 'features'

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview',     label: 'Overview'      },
  { id: 'pieces',       label: 'My Pieces'     },
  { id: 'collections',  label: 'Collections'   },
  { id: 'pinned',       label: 'Pinned Pieces'  },
  { id: 'analytics',   label: 'Analytics'     },
  { id: 'features',    label: 'Feature Slots'  },
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

// ── Connect redirect handler ──────────────────────────────────────────────────

function useConnectRedirect() {
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const [connectToast, setConnectToast] = useState<'success' | 'refresh' | null>(null)

  const onboardMutation = useMutation({
    mutationFn: () => authorDashboardService.connectOnboard(),
    onSuccess: (data) => {
      window.location.href = (data as { accountLinkUrl: string }).accountLinkUrl
    },
  })

  useEffect(() => {
    const connect = searchParams.get('connect')
    if (!connect) return

    // Strip param immediately so a hard-refresh doesn't re-trigger
    const next = new URLSearchParams(searchParams)
    next.delete('connect')
    setSearchParams(next, { replace: true })

    if (connect === 'return') {
      // Invalidate the connect status cache so the UI reflects the new state
      queryClient.invalidateQueries({ queryKey: connectStatusQueryKey })
      setConnectToast('success')
      setTimeout(() => setConnectToast(null), 5000)
    } else if (connect === 'refresh') {
      // Onboarding link expired — automatically request a fresh one
      setConnectToast('refresh')
      onboardMutation.mutate()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return connectToast
}

// ── Page content ──────────────────────────────────────────────────────────────

function AuthorDashboardContent() {
  const { data: me, isLoading } = useMe()
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const connectToast = useConnectRedirect()

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
      {connectToast === 'success' && (
        <div className="mb-6 px-4 py-3 bg-[#5a9e6e]/15 border border-[#5a9e6e]/30 rounded-sm text-[0.82rem] font-body text-[#5a9e6e]">
          Stripe account connected successfully. You can now enable Author subscriptions.
        </div>
      )}
      {connectToast === 'refresh' && (
        <div className="mb-6 px-4 py-3 bg-gold/10 border border-gold/25 rounded-sm text-[0.82rem] font-body text-parchment-dim">
          Your Stripe onboarding link expired. Redirecting you back to Stripe…
        </div>
      )}
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
