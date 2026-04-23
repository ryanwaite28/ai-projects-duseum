import { useState, useEffect } from 'react'
import { PageLayout } from '../../components/layout/PageLayout'
import { EyebrowLabel } from '../../components/ui/EyebrowLabel'
import { Button } from '../../components/ui/Button'
import { GoldDivider } from '../../components/ui/GoldDivider'
import { ProtectedRoute } from '../../components/layout/ProtectedRoute'
import { useNotificationPreferences, useUpdateNotifPref } from '../../hooks/use-follows'
import type { NotificationPref } from '../../services/follows.service'
import { cn } from '../../lib/utils'

const PREF_OPTIONS: { value: NotificationPref; label: string; sub: string }[] = [
  { value: 'ALL_NEW_PIECES', label: 'All new pieces',  sub: 'Get notified for every new public and private piece' },
  { value: 'PUBLIC_ONLY',   label: 'Public only',     sub: 'Only notify me about public pieces' },
  { value: 'NONE',          label: 'None',             sub: 'No email notifications from this author' },
]

function NotificationsSettings() {
  const { data, isLoading } = useNotificationPreferences()
  const updateMut = useUpdateNotifPref()

  const [globalOptOut, setGlobalOptOut] = useState(false)
  const [defaultPref, setDefaultPref]   = useState<NotificationPref>('ALL_NEW_PIECES')
  const [saved, setSaved]               = useState(false)

  useEffect(() => {
    if (data) {
      setGlobalOptOut(data.globalOptOut)
      setDefaultPref(data.defaultPref)
    }
  }, [data])

  const handleSave = () => {
    updateMut.mutate({ globalOptOut, defaultPref }, {
      onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 3000) },
    })
  }

  const removeOverride = (authorId: string) => {
    const remaining = (data?.perAuthorOverrides ?? [])
      .filter((o) => o.authorId !== authorId)
      .map((o) => ({ authorId: o.authorId, pref: o.pref }))
    updateMut.mutate({ perAuthorOverrides: remaining })
  }

  const updateOverride = (authorId: string, pref: NotificationPref) => {
    const updated = (data?.perAuthorOverrides ?? []).map((o) =>
      o.authorId === authorId ? { ...o, pref } : o
    ).map((o) => ({ authorId: o.authorId, pref: o.pref }))
    updateMut.mutate({ perAuthorOverrides: updated })
  }

  if (isLoading) {
    return (
      <PageLayout>
        <div className="min-h-screen bg-ink animate-pulse py-32 px-8">
          <div className="max-w-[700px] mx-auto space-y-4">
            <div className="h-3 bg-ink-soft rounded w-24" />
            <div className="h-8 bg-ink-soft rounded w-64" />
          </div>
        </div>
      </PageLayout>
    )
  }

  return (
    <PageLayout>
      <section className="min-h-screen py-32 px-8 bg-ink">
        <div className="max-w-[700px] mx-auto">
          <EyebrowLabel>Account</EyebrowLabel>
          <h1 className="font-display text-[clamp(1.8rem,3vw,2.5rem)] font-normal text-warm-white leading-[1.12] mb-2">
            Notification preferences
          </h1>
          <GoldDivider />

          {/* Global opt-out */}
          <div className="bg-ink-soft border border-gold/15 rounded-sm p-6 mb-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[0.88rem] font-medium text-parchment mb-1">Pause all email notifications</p>
                <p className="text-[0.78rem] font-light text-stone-light">No notification emails will be sent while this is on.</p>
              </div>
              <button
                onClick={() => setGlobalOptOut((v) => !v)}
                className={cn(
                  'relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0',
                  globalOptOut ? 'bg-gold' : 'bg-ink-raised border border-gold/20',
                )}
              >
                <span className={cn(
                  'absolute top-0.5 w-5 h-5 rounded-full bg-ink-soft transition-transform duration-200',
                  globalOptOut ? 'translate-x-5' : 'translate-x-0.5',
                )} />
              </button>
            </div>
          </div>

          {/* Default pref */}
          <div className={cn('mb-8', globalOptOut && 'opacity-40 pointer-events-none')}>
            <p className="text-[0.78rem] font-medium tracking-[0.14em] uppercase text-stone-light mb-4">Default notification setting</p>
            <div className="flex flex-col gap-2">
              {PREF_OPTIONS.map(({ value, label, sub }) => (
                <button
                  key={value}
                  onClick={() => setDefaultPref(value)}
                  className={cn(
                    'flex items-start gap-4 p-4 rounded-sm border text-left transition-all duration-150',
                    defaultPref === value
                      ? 'border-gold/40 bg-gold/5'
                      : 'border-gold/10 bg-ink-soft hover:border-gold/25',
                  )}
                >
                  <span className={cn(
                    'mt-0.5 w-4 h-4 flex-shrink-0 rounded-full border-2 flex items-center justify-center transition-colors',
                    defaultPref === value ? 'border-gold' : 'border-gold/25',
                  )}>
                    {defaultPref === value && <span className="w-2 h-2 rounded-full bg-gold" />}
                  </span>
                  <div>
                    <p className="text-[0.85rem] font-medium text-parchment">{label}</p>
                    <p className="text-[0.75rem] font-light text-stone-light mt-0.5">{sub}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <Button onClick={handleSave} disabled={updateMut.isPending} variant="primary">
            {updateMut.isPending ? 'Saving…' : saved ? 'Saved ✓' : 'Save changes'}
          </Button>

          {/* Per-author overrides */}
          {(data?.perAuthorOverrides ?? []).length > 0 && (
            <div className={cn('mt-16', globalOptOut && 'opacity-40 pointer-events-none')}>
              <GoldDivider />
              <p className="text-[0.78rem] font-medium tracking-[0.14em] uppercase text-stone-light mb-6">Per-author overrides</p>
              <div className="flex flex-col gap-3">
                {(data?.perAuthorOverrides ?? []).map((o) => (
                  <div key={o.authorId} className="flex items-center gap-4 p-4 bg-ink-soft border border-gold/10 rounded-sm">
                    <div className="flex-1 min-w-0">
                      <p className="text-[0.85rem] font-medium text-parchment truncate">
                        {o.displayName ?? o.authorId}
                      </p>
                    </div>
                    <select
                      value={o.pref}
                      onChange={(e) => updateOverride(o.authorId, e.target.value as NotificationPref)}
                      className="bg-ink border border-gold/20 text-parchment-dim text-[0.78rem] font-light rounded-sm px-3 py-1.5 outline-none focus:border-gold/40"
                    >
                      {PREF_OPTIONS.map(({ value, label }) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => removeOverride(o.authorId)}
                      className="text-[0.72rem] font-light text-stone-light hover:text-[#c0544a] transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </PageLayout>
  )
}

export default function NotificationsSettingsPage() {
  return <ProtectedRoute><NotificationsSettings /></ProtectedRoute>
}
