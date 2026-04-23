import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AdminLayout } from '../../components/layout/AdminLayout'
import { Button } from '../../components/ui/Button'
import { adminService } from '../../services/admin.service'
import type { AdminConfigBody } from '../../services/admin.service'

// ── Field row ─────────────────────────────────────────────────────────────────

const FieldRow = ({
  label,
  description,
  children,
}: {
  label:       string
  description: string
  children:    React.ReactNode
}) => (
  <div className="py-5 border-b border-gold/8 last:border-0 flex flex-col md:flex-row md:items-start gap-3">
    <div className="md:w-64 shrink-0">
      <p className="text-[0.82rem] font-medium text-parchment">{label}</p>
      <p className="text-[0.75rem] text-stone-light mt-0.5">{description}</p>
    </div>
    <div className="flex-1">{children}</div>
  </div>
)

// ── Config page ───────────────────────────────────────────────────────────────

export default function AdminConfigPage() {
  const [fields, setFields] = useState<{
    freeTierLimit:            string
    platformSubPriceId:       string
    platformCutPercent:       string
    weeklyFeatureFeeUsd:      string
    weeklyFeatureSlotCount:   string
    weeklyFeatureAdvanceWeeks: string
  }>({
    freeTierLimit:            '',
    platformSubPriceId:       '',
    platformCutPercent:       '',
    weeklyFeatureFeeUsd:      '',
    weeklyFeatureSlotCount:   '',
    weeklyFeatureAdvanceWeeks: '',
  })

  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 4000)
  }

  const update = useMutation({
    mutationFn: (body: AdminConfigBody) => adminService.updateConfig(body),
    onSuccess:  (res) => {
      showToast('success', `Updated: ${res.updated.join(', ')}`)
      // Clear updated fields
      setFields((prev) => {
        const next = { ...prev }
        for (const key of res.updated) {
          const map: Record<string, keyof typeof fields> = {
            freeTierLimit:            'freeTierLimit',
            platformSubPriceId:       'platformSubPriceId',
            platformCutPercent:       'platformCutPercent',
            weeklyFeatureFeeUsd:      'weeklyFeatureFeeUsd',
            weeklyFeatureSlotCount:   'weeklyFeatureSlotCount',
            weeklyFeatureAdvanceWeeks: 'weeklyFeatureAdvanceWeeks',
          }
          if (map[key]) next[map[key]] = ''
        }
        return next
      })
    },
    onError: () => showToast('error', 'Update failed. Check the values and try again.'),
  })

  const set = (k: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields((prev) => ({ ...prev, [k]: e.target.value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const body: AdminConfigBody = {}
    if (fields.freeTierLimit)            body.freeTierLimit            = parseInt(fields.freeTierLimit, 10)
    if (fields.platformSubPriceId)       body.platformSubPriceId       = fields.platformSubPriceId
    if (fields.platformCutPercent)       body.platformCutPercent       = parseFloat(fields.platformCutPercent)
    if (fields.weeklyFeatureFeeUsd)      body.weeklyFeatureFeeUsd      = parseFloat(fields.weeklyFeatureFeeUsd)
    if (fields.weeklyFeatureSlotCount)   body.weeklyFeatureSlotCount   = parseInt(fields.weeklyFeatureSlotCount, 10)
    if (fields.weeklyFeatureAdvanceWeeks) body.weeklyFeatureAdvanceWeeks = parseInt(fields.weeklyFeatureAdvanceWeeks, 10)

    if (Object.keys(body).length === 0) {
      showToast('error', 'No fields to update — fill in at least one value.')
      return
    }
    update.mutate(body)
  }

  const inputCls = 'bg-ink border border-gold/20 rounded-sm px-3 py-2 text-[0.85rem] text-parchment placeholder:text-stone-light/40 focus:outline-none focus:border-gold/50 w-full max-w-xs'

  return (
    <AdminLayout title="Platform Config">
      {toast && (
        <div
          className={`mb-6 px-4 py-3 rounded-sm text-sm border ${
            toast.type === 'success'
              ? 'text-[#5a9e6e] bg-[#5a9e6e]/8 border-[#5a9e6e]/20'
              : 'text-[#c0544a] bg-[#c0544a]/8 border-[#c0544a]/20'
          }`}
        >
          {toast.msg}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="bg-ink-soft border border-gold/10 rounded-sm px-5">
          <FieldRow label="Free Tier Limit" description="Max pieces a free viewer can access.">
            <input
              type="number"
              min={0}
              step={1}
              value={fields.freeTierLimit}
              onChange={set('freeTierLimit')}
              placeholder="e.g. 10"
              className={inputCls}
            />
          </FieldRow>

          <FieldRow label="Platform Sub Price ID" description="Stripe price ID for the platform subscription.">
            <input
              type="text"
              value={fields.platformSubPriceId}
              onChange={set('platformSubPriceId')}
              placeholder="price_xxx"
              className={`${inputCls} font-mono`}
            />
          </FieldRow>

          <FieldRow label="Platform Cut (%)" description="Revenue percentage retained by the platform (0–100).">
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={fields.platformCutPercent}
              onChange={set('platformCutPercent')}
              placeholder="e.g. 20"
              className={inputCls}
            />
          </FieldRow>

          <FieldRow label="Weekly Feature Fee (USD)" description="Price authors pay to book a weekly feature slot.">
            <input
              type="number"
              min={0}
              step={1}
              value={fields.weeklyFeatureFeeUsd}
              onChange={set('weeklyFeatureFeeUsd')}
              placeholder="e.g. 25"
              className={inputCls}
            />
          </FieldRow>

          <FieldRow label="Weekly Feature Slot Count" description="Number of authors featured per week (default: 10).">
            <input
              type="number"
              min={1}
              step={1}
              value={fields.weeklyFeatureSlotCount}
              onChange={set('weeklyFeatureSlotCount')}
              placeholder="e.g. 10"
              className={inputCls}
            />
          </FieldRow>

          <FieldRow label="Advance Booking Window (weeks)" description="How many weeks ahead authors can book a feature slot.">
            <input
              type="number"
              min={1}
              step={1}
              value={fields.weeklyFeatureAdvanceWeeks}
              onChange={set('weeklyFeatureAdvanceWeeks')}
              placeholder="e.g. 8"
              className={inputCls}
            />
          </FieldRow>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save Changes'}
          </Button>
          <p className="text-[0.78rem] text-stone-light">
            Only populated fields are sent — blank fields are left unchanged.
          </p>
        </div>
      </form>
    </AdminLayout>
  )
}
