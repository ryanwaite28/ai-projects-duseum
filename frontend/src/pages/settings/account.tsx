import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { PageLayout } from '../../components/layout/PageLayout'
import { EyebrowLabel } from '../../components/ui/EyebrowLabel'
import { GoldDivider } from '../../components/ui/GoldDivider'
import { Button } from '../../components/ui/Button'
import { useMe, useMeQueryKey } from '../../hooks/use-me'
import { useAuthStore } from '../../store/auth.store'
import { api } from '../../services/api'

function AccountSettings() {
  const { user } = useAuthStore()
  const { data: me, isLoading } = useMe()
  const qc = useQueryClient()

  const [displayName, setDisplayName] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (me?.viewerProfile?.displayName) {
      setDisplayName(me.viewerProfile.displayName)
    }
  }, [me?.viewerProfile?.displayName])

  const updateMutation = useMutation({
    mutationFn: (name: string) =>
      api.put('/users/me/viewer', { displayName: name }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: useMeQueryKey })
      setSaved(true)
      setError(null)
      setTimeout(() => setSaved(false), 3000)
    },
    onError: (err: Error) => {
      setError(err.message ?? 'Failed to save. Please try again.')
    },
  })

  const handleSave = () => {
    setError(null)
    if (displayName.trim().length < 1) {
      setError('Display name cannot be empty.')
      return
    }
    updateMutation.mutate(displayName.trim())
  }

  if (isLoading) {
    return (
      <PageLayout>
        <div className="min-h-screen py-32 px-8 bg-ink animate-pulse">
          <div className="max-w-[600px] mx-auto space-y-4">
            <div className="h-3 w-24 bg-ink-soft rounded" />
            <div className="h-9 w-64 bg-ink-soft rounded" />
          </div>
        </div>
      </PageLayout>
    )
  }

  return (
    <PageLayout>
      <section className="min-h-screen py-32 px-8 bg-ink">
        <div className="max-w-[600px] mx-auto">
          <EyebrowLabel>Settings</EyebrowLabel>
          <h1 className="font-display text-[clamp(1.8rem,3vw,2.5rem)] font-normal text-warm-white leading-[1.12] mb-2">
            Account<br />
            <em className="italic text-gold-light">settings</em>
          </h1>
          <GoldDivider />

          {/* Email (read-only) */}
          <div className="mb-8">
            <p className="text-[0.78rem] font-medium tracking-[0.14em] uppercase text-stone-light mb-2">
              Email address
            </p>
            <div className="flex items-center gap-3 px-4 py-3 bg-ink-soft border border-gold/15 rounded-sm">
              <span className="text-[0.88rem] font-light text-parchment-dim">{user?.email}</span>
              <span className="ml-auto text-[0.62rem] font-medium tracking-[0.12em] uppercase text-stone-light bg-stone/15 px-[0.6rem] py-[0.25rem] rounded-sm">
                Read-only
              </span>
            </div>
            <p className="text-[0.72rem] font-light text-stone-light mt-1.5">
              Email is managed through your authentication provider.
            </p>
          </div>

          {/* Display name */}
          <div className="mb-10">
            <label className="block text-[0.78rem] font-medium tracking-[0.14em] uppercase text-stone-light mb-2">
              Display name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={100}
              placeholder="Your public display name"
              className="w-full bg-ink-soft border border-gold/20 text-parchment placeholder:text-stone-light/40 text-[0.88rem] font-light px-4 py-3 rounded-sm outline-none focus:border-gold/50 transition-colors duration-150"
            />
          </div>

          {error && (
            <div className="mb-6 px-4 py-3 bg-[#c0544a]/10 border border-[#c0544a]/30 rounded-sm text-[0.82rem] font-body text-[#c0544a]">
              {error}
            </div>
          )}

          <div className="flex items-center gap-4">
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? 'Saving…' : saved ? 'Saved ✓' : 'Save changes'}
            </Button>
            <Link to="/dashboard">
              <button className="text-[0.82rem] font-light text-stone-light hover:text-parchment transition-colors duration-150">
                Cancel
              </button>
            </Link>
          </div>

          {/* Nav to other settings */}
          <div className="mt-16 pt-8 border-t border-gold/10 flex flex-wrap gap-3">
            <Link to="/settings/notifications">
              <Button variant="secondary">Notification Preferences</Button>
            </Link>
            <Link to="/settings/subscriptions">
              <Button variant="secondary">Subscriptions</Button>
            </Link>
          </div>
        </div>
      </section>
    </PageLayout>
  )
}

export default function AccountSettingsPage() {
  return <AccountSettings />
}
