import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useMe } from '../../../hooks/use-me'
import { listArtworks, updateArtwork, deleteArtwork } from '../../../services/artworks.service'
import type { ArtworkListItem, ArtworkVisibility } from '../../../types/artwork'

// ── Visibility badge ──────────────────────────────────────────────────────────

const visCls: Record<string, string> = {
  PUBLIC:  'text-[#5a9e6e] bg-[#5a9e6e]/10',
  PRIVATE: 'text-gold bg-gold/10',
  DRAFT:   'text-stone-light bg-white/[0.04]',
}

// ── Edit slide-out panel ──────────────────────────────────────────────────────

function EditPanel({
  piece,
  onClose,
  onSaved,
}: {
  piece:    ArtworkListItem
  onClose:  () => void
  onSaved:  () => void
}) {
  const [title,           setTitle]           = useState(piece.title)
  const [description,     setDescription]     = useState('')
  const [visibility,      setVisibility]      = useState<ArtworkVisibility>(piece.visibility ?? 'PUBLIC')
  const [commentsEnabled, setCommentsEnabled] = useState(piece.commentsEnabled ?? true)
  const [error,           setError]           = useState<string | null>(null)

  const save = useMutation({
    mutationFn: () => updateArtwork(piece.artworkId, { title, description: description || undefined, visibility, commentsEnabled }),
    onSuccess:  () => { onSaved(); onClose() },
    onError:    () => setError('Failed to save. Please try again.'),
  })

  const inputCls = 'w-full bg-ink border border-gold/20 focus:border-gold/50 outline-none text-parchment text-[0.85rem] px-3 py-2 rounded-sm transition-colors'

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-ink/60 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-sm bg-ink-soft border-l border-gold/10 flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gold/10">
          <p className="text-[0.75rem] font-medium tracking-[0.12em] uppercase text-gold">Edit Piece</p>
          <button onClick={onClose} className="text-stone-light hover:text-parchment transition-colors text-lg leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="block text-[0.68rem] tracking-[0.14em] uppercase text-stone-light mb-1">Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
          </div>

          <div>
            <label className="block text-[0.68rem] tracking-[0.14em] uppercase text-stone-light mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Leave blank to keep existing"
              className={`${inputCls} resize-none`}
            />
          </div>

          <div>
            <label className="block text-[0.68rem] tracking-[0.14em] uppercase text-stone-light mb-1">Visibility</label>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as ArtworkVisibility)}
              className={`${inputCls} appearance-none cursor-pointer`}
            >
              <option value="PUBLIC">Public</option>
              <option value="PRIVATE">Private</option>
              <option value="DRAFT">Draft</option>
            </select>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={commentsEnabled}
              onChange={(e) => setCommentsEnabled(e.target.checked)}
              className="w-4 h-4 accent-gold"
            />
            <span className="text-[0.82rem] text-parchment-dim">Comments enabled</span>
          </label>

          {error && <p className="text-[0.8rem] text-[#c0544a]">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-gold/10">
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending || !title.trim()}
            className="w-full bg-gold hover:bg-gold-light text-ink font-body text-sm font-medium uppercase tracking-[0.04em] py-[0.8rem] rounded-sm transition-colors disabled:opacity-60"
          >
            {save.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Pieces tab ────────────────────────────────────────────────────────────────

export function PiecesTab() {
  const qc = useQueryClient()
  const { data: me } = useMe()
  const userId = me?.account.userId ?? ''

  const [statusFilter, setStatusFilter] = useState('')
  const [cursor,       setCursor]       = useState<string | undefined>()
  const [allPieces,    setAllPieces]    = useState<ArtworkListItem[]>([])
  const [editing,      setEditing]      = useState<ArtworkListItem | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<ArtworkListItem | null>(null)

  const filters = { authorId: userId, limit: 50, ...(statusFilter && { status: statusFilter }), ...(cursor && { cursor }) }

  const { data: lastPage, isFetching } = useQuery({
    queryKey: ['artworks', 'mine', filters],
    queryFn:  async () => {
      const res = await listArtworks(filters)
      setAllPieces((prev) => cursor ? [...prev, ...res.items] : res.items)
      return res
    },
    enabled: !!userId,
    staleTime: 0,
  })

  const invalidate = () => {
    setAllPieces([])
    setCursor(undefined)
    qc.invalidateQueries({ queryKey: ['artworks', 'mine'] })
  }

  const archive = useMutation({
    mutationFn: (id: string) => deleteArtwork(id, false),
    onSuccess:  invalidate,
  })

  const permanentDelete = useMutation({
    mutationFn: (id: string) => deleteArtwork(id, true),
    onSuccess:  () => { setConfirmDelete(null); invalidate() },
  })

  const handleSearch = () => { setAllPieces([]); setCursor(undefined) }

  return (
    <>
      {editing && (
        <EditPanel piece={editing} onClose={() => setEditing(null)} onSaved={invalidate} />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-ink/70 backdrop-blur-sm" onClick={() => setConfirmDelete(null)} />
          <div className="relative bg-ink-soft border border-gold/10 rounded-sm p-6 max-w-sm w-full">
            <p className="text-[0.68rem] font-medium tracking-[0.18em] uppercase text-[#c0544a] mb-2">Permanent Delete</p>
            <p className="text-parchment text-sm mb-1">"{confirmDelete.title}"</p>
            <p className="text-stone-light text-[0.8rem] mb-6">This cannot be undone. The artwork file will be removed.</p>
            <div className="flex gap-3">
              <button
                onClick={() => permanentDelete.mutate(confirmDelete.artworkId)}
                disabled={permanentDelete.isPending}
                className="flex-1 bg-[#c0544a] hover:bg-[#d0645a] text-warm-white font-body text-sm font-medium uppercase tracking-[0.04em] py-[0.7rem] rounded-sm transition-colors disabled:opacity-60"
              >
                {permanentDelete.isPending ? 'Deleting…' : 'Delete'}
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 border border-gold/25 text-parchment-dim font-body text-sm uppercase tracking-[0.04em] py-[0.7rem] rounded-sm hover:border-gold/50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div className="flex flex-col gap-1">
          <label className="text-[0.68rem] tracking-[0.16em] uppercase text-stone-light">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-ink-soft border border-gold/20 rounded-sm px-3 py-2 text-[0.85rem] text-parchment focus:outline-none focus:border-gold/50 appearance-none cursor-pointer"
          >
            <option value="">All</option>
            <option value="ACTIVE">Active</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>
        <button
          onClick={handleSearch}
          className="text-gold border border-gold/40 hover:border-gold hover:bg-gold/10 font-body text-[0.8rem] font-medium uppercase tracking-[0.04em] px-[1.1rem] py-[0.45rem] rounded-md transition-all"
        >
          Filter
        </button>
      </div>

      {/* Table */}
      <div className="bg-ink-soft border border-gold/10 rounded-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gold/10">
                <th className="py-3 px-4 text-left text-[0.68rem] tracking-[0.14em] uppercase text-stone-light font-medium">Piece</th>
                <th className="py-3 px-4 text-left text-[0.68rem] tracking-[0.14em] uppercase text-stone-light font-medium">Visibility</th>
                <th className="py-3 px-4 text-right text-[0.68rem] tracking-[0.14em] uppercase text-stone-light font-medium">Views</th>
                <th className="py-3 px-4 text-right text-[0.68rem] tracking-[0.14em] uppercase text-stone-light font-medium">Notified</th>
                <th className="py-3 px-4 text-right text-[0.68rem] tracking-[0.14em] uppercase text-stone-light font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {allPieces.map((p) => (
                <tr key={p.artworkId} className="border-b border-gold/[0.06] last:border-0 hover:bg-gold/[0.02] transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      {p.thumbnailUrl ? (
                        <img src={p.thumbnailUrl} alt="" className="w-8 h-8 object-cover rounded-sm border border-gold/10 flex-shrink-0" />
                      ) : (
                        <div className="w-8 h-8 bg-ink border border-gold/10 rounded-sm flex-shrink-0" />
                      )}
                      <span className="text-[0.82rem] text-parchment line-clamp-1">{p.title}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`text-[0.7rem] font-medium tracking-[0.1em] uppercase px-2 py-0.5 rounded-sm ${visCls[p.visibility ?? 'DRAFT']}`}>
                      {p.visibility ?? '—'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right text-[0.78rem] text-stone-light">{p.viewCount.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right text-[0.78rem] text-stone-light">{(p.notifiedCount ?? 0).toLocaleString()}</td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => setEditing(p)}
                        className="text-[0.72rem] font-medium uppercase tracking-[0.06em] text-gold hover:text-gold-light transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => archive.mutate(p.artworkId)}
                        disabled={archive.isPending}
                        className="text-[0.72rem] font-medium uppercase tracking-[0.06em] text-stone-light hover:text-parchment transition-colors disabled:opacity-40"
                      >
                        Archive
                      </button>
                      <button
                        onClick={() => setConfirmDelete(p)}
                        className="text-[0.72rem] font-medium uppercase tracking-[0.06em] text-[#c0544a] hover:text-[#d0645a] transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {allPieces.length === 0 && !isFetching && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-stone-light text-sm">No pieces found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Load more */}
      {lastPage?.nextCursor && (
        <div className="mt-4 text-center">
          <button
            onClick={() => setCursor(lastPage.nextCursor ?? undefined)}
            disabled={isFetching}
            className="bg-transparent border border-gold/25 hover:border-gold/60 text-parchment-dim hover:text-warm-white font-body text-sm font-light uppercase tracking-[0.04em] px-8 py-[0.9rem] rounded-sm transition-colors disabled:opacity-50"
          >
            {isFetching ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </>
  )
}
