import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AdminLayout } from '../../components/layout/AdminLayout'
import { Button } from '../../components/ui/Button'
import { adminService } from '../../services/admin.service'

// ── Confirm modal ─────────────────────────────────────────────────────────────

const ConfirmRemoveModal = ({
  artworkId,
  onConfirm,
  onCancel,
  loading,
}: {
  artworkId: string
  onConfirm: () => void
  onCancel:  () => void
  loading:   boolean
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 backdrop-blur-sm px-4">
    <div className="bg-ink-soft border border-gold/20 rounded-sm p-7 w-full max-w-md">
      <p className="text-[0.68rem] font-medium tracking-[0.2em] uppercase text-gold mb-3">
        Confirm Removal
      </p>
      <p className="text-parchment-dim text-sm mb-1">
        Remove artwork <span className="font-mono text-parchment">{artworkId}</span>?
      </p>
      <p className="text-stone-light text-[0.8rem] mb-6">
        This archives the piece and deletes it from storage. This action cannot be undone.
      </p>
      <div className="flex gap-3 justify-end">
        <Button variant="secondary" onClick={onCancel} disabled={loading}>Cancel</Button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className="inline-flex items-center gap-2 bg-[#c0544a] hover:bg-[#c0544a]/80 text-white font-body text-sm font-medium uppercase tracking-[0.04em] px-6 py-[0.7rem] rounded-sm transition-colors duration-150 disabled:opacity-50"
        >
          {loading ? 'Removing…' : 'Remove Artwork'}
        </button>
      </div>
    </div>
  </div>
)

// ── Content moderation page ───────────────────────────────────────────────────

export default function AdminContentPage() {
  const qc = useQueryClient()
  const [artworkId, setArtworkId] = useState('')
  const [confirming, setConfirming] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 4000)
  }

  const remove = useMutation({
    mutationFn: (id: string) => adminService.removeArtwork(id),
    onSuccess:  (res) => {
      setConfirming(null)
      setArtworkId('')
      showToast('success', `Artwork ${res.artworkId} archived successfully.`)
      qc.invalidateQueries({ queryKey: ['artworks'] })
    },
    onError: () => {
      setConfirming(null)
      showToast('error', 'Failed to remove artwork. Check the ID and try again.')
    },
  })

  return (
    <AdminLayout title="Content Moderation">
      {/* ── Toast ──────────────────────────────────────────────────────────── */}
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

      <div className="max-w-xl">
        {/* ── Info ───────────────────────────────────────────────────────────── */}
        <div className="bg-ink-soft border border-gold/10 rounded-sm p-5 mb-6">
          <p className="text-[0.68rem] font-medium tracking-[0.2em] uppercase text-gold mb-2">
            Remove Art Piece
          </p>
          <p className="text-stone-light text-[0.85rem]">
            Enter the artwork ID to archive it and remove it from public view. The S3 media file is
            also deleted. This action is irreversible.
          </p>
        </div>

        {/* ── Remove form ───────────────────────────────────────────────────── */}
        <div className="bg-ink-soft border border-gold/10 rounded-sm p-5">
          <div className="flex flex-col gap-1 mb-4">
            <label className="text-[0.68rem] tracking-[0.16em] uppercase text-stone-light">
              Artwork ID
            </label>
            <input
              type="text"
              value={artworkId}
              onChange={(e) => setArtworkId(e.target.value.trim())}
              placeholder="e.g. abc123"
              className="bg-ink border border-gold/20 rounded-sm px-3 py-2 text-[0.85rem] text-parchment font-mono placeholder:text-stone-light/40 focus:outline-none focus:border-gold/50"
            />
          </div>
          <button
            onClick={() => artworkId && setConfirming(artworkId)}
            disabled={!artworkId}
            className="inline-flex items-center gap-2 bg-[#c0544a] hover:bg-[#c0544a]/80 text-white font-body text-sm font-medium uppercase tracking-[0.04em] px-6 py-[0.7rem] rounded-sm transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Remove Artwork
          </button>
        </div>

        {/* ── Recent removals hint ───────────────────────────────────────────── */}
        <p className="mt-4 text-[0.78rem] text-stone-light">
          Artwork IDs can be found in the browse page URL: <span className="font-mono">/artworks/&#123;artworkId&#125;</span>
        </p>
      </div>

      {/* ── Confirm modal ─────────────────────────────────────────────────── */}
      {confirming && (
        <ConfirmRemoveModal
          artworkId={confirming}
          onConfirm={() => remove.mutate(confirming)}
          onCancel={() => setConfirming(null)}
          loading={remove.isPending}
        />
      )}
    </AdminLayout>
  )
}
