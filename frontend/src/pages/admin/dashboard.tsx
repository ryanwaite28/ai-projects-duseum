import { useQuery } from '@tanstack/react-query'
import { AdminLayout } from '../../components/layout/AdminLayout'
import { adminService } from '../../services/admin.service'
import type { AdminDashboard } from '../../services/admin.service'

// ── Stat card ─────────────────────────────────────────────────────────────────

const StatCard = ({ label, value, sub }: { label: string; value: string | number; sub?: string }) => (
  <div className="bg-ink-soft border border-gold/10 rounded-sm p-5">
    <p className="text-[0.68rem] font-medium tracking-[0.2em] uppercase text-gold mb-2">{label}</p>
    <p className="font-display text-[1.9rem] font-semibold text-warm-white leading-none">{value}</p>
    {sub && <p className="text-[0.78rem] text-stone-light mt-1">{sub}</p>}
  </div>
)

// ── DLQ indicator ─────────────────────────────────────────────────────────────

const DlqIndicator = ({ label, depth }: { label: string; depth: number }) => (
  <div className="flex items-center justify-between py-3 border-b border-gold/8 last:border-0">
    <span className="text-[0.82rem] text-stone-light">{label}</span>
    <span
      className={`text-[0.78rem] font-medium px-2 py-0.5 rounded-sm ${
        depth === 0
          ? 'text-[#5a9e6e] bg-[#5a9e6e]/10'
          : 'text-[#c0544a] bg-[#c0544a]/10'
      }`}
    >
      {depth === 0 ? 'Empty' : `${depth} message${depth === 1 ? '' : 's'}`}
    </span>
  </div>
)

// ── Dashboard page ────────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const { data, isLoading, error } = useQuery<AdminDashboard>({
    queryKey: ['admin', 'dashboard'],
    queryFn:  () => adminService.getDashboard(),
    refetchInterval: 60_000,
  })

  return (
    <AdminLayout title="Dashboard">
      {isLoading && (
        <div className="flex items-center gap-2 text-stone-light text-sm">
          <div className="w-1 h-1 rounded-full bg-gold animate-float" />
          Loading…
        </div>
      )}

      {error && (
        <p className="text-[#c0544a] text-sm">Failed to load dashboard data.</p>
      )}

      {data && (
        <div className="space-y-8">
          {/* ── Stat cards ─────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total Users"       value={data.totalUsers.toLocaleString()} />
            <StatCard label="Platform Subs"     value={data.activePlatformSubs.toLocaleString()} />
            <StatCard label="Author Subs"        value={data.activeAuthorSubs.toLocaleString()} />
            <StatCard
              label="Platform MRR"
              value={`$${data.platformMrrUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="New Signups (7d)"
              value={data.newSignups7d ?? '—'}
              sub={data.newSignups7d === null ? 'Counter not yet seeded' : undefined}
            />
            <StatCard
              label="New Signups (30d)"
              value={data.newSignups30d ?? '—'}
              sub={data.newSignups30d === null ? 'Counter not yet seeded' : undefined}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* ── DLQ depths ───────────────────────────────────────────────── */}
            <div className="bg-ink-soft border border-gold/10 rounded-sm p-5">
              <p className="text-[0.68rem] font-medium tracking-[0.2em] uppercase text-gold mb-4">
                Queue Health
              </p>
              <DlqIndicator label="Stripe Webhook DLQ"   depth={data.dlqDepths.stripeWebhook} />
              <DlqIndicator label="Notifications DLQ"     depth={data.dlqDepths.notifications} />
            </div>

            {/* ── Upcoming feature bookings ─────────────────────────────────── */}
            <div className="bg-ink-soft border border-gold/10 rounded-sm p-5">
              <p className="text-[0.68rem] font-medium tracking-[0.2em] uppercase text-gold mb-4">
                Upcoming Feature Bookings
              </p>
              {data.upcomingFeatureBookings.length === 0 ? (
                <p className="text-stone-light text-[0.82rem]">No upcoming bookings.</p>
              ) : (
                <div className="space-y-0">
                  {data.upcomingFeatureBookings.map((b) => (
                    <div
                      key={b.isoWeek}
                      className="flex items-center justify-between py-2.5 border-b border-gold/8 last:border-0"
                    >
                      <span className="font-mono text-[0.78rem] text-parchment-dim">{b.isoWeek}</span>
                      <div className="flex items-center gap-3 text-[0.78rem]">
                        <span className="text-[#5a9e6e]">{b.activeCount} active</span>
                        <span className="text-stone-light">{b.confirmedCount} confirmed</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
