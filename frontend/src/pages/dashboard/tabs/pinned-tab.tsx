import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useMe, useMeQueryKey } from '../../../hooks/use-me'
import { listArtworks } from '../../../services/artworks.service'
import { api } from '../../../services/api'
import type { ArtworkListItem } from '../../../types/artwork'

const MAX_PINNED = 3

export function PinnedTab() {
  const qc = useQueryClient()
  const { data: me } = useMe()
  const userId = me?.account.userId ?? ''
  const currentPinned: string[] = me?.authorProfile?.featuredPieceIds ?? []

  const [pinned,  setPinned]  = useState<string[]>(currentPinned)
  const [saved,   setSaved]   = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const dragOver  = useRef<number | null>(null)

  const { data: piecesRes, isFetching } = useQuery({
    queryKey: ['artworks', 'mine', 'all', userId],
    queryFn:  () => listArtworks({ authorId: userId, limit: 100 }),
    enabled:  !!userId,
    staleTime: 60_000,
  })

  const publicPieces = (piecesRes?.items ?? []).filter((p) => p.visibility === 'PUBLIC' || !p.visibility)
  const pieceById    = Object.fromEntries(publicPieces.map((p) => [p.artworkId, p]))
  const pinnedPieces = pinned.map((id) => pieceById[id]).filter(Boolean) as ArtworkListItem[]
  const unpinned     = publicPieces.filter((p) => !pinned.includes(p.artworkId))

  const savePinned = useMutation({
    mutationFn: (featuredPieceIds: string[]) =>
      api.put<unknown>('/users/me/author', { featuredPieceIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: useMeQueryKey })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
  })

  // ── Drag-and-drop handlers ────────────────────────────────────────────────

  const handleDragStart = (index: number) => {
    setDragIdx(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    dragOver.current = index
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (dragIdx === null || dragOver.current === null || dragIdx === dragOver.current) {
      setDragIdx(null)
      dragOver.current = null
      return
    }
    const next = [...pinned]
    const [moved] = next.splice(dragIdx, 1)
    next.splice(dragOver.current, 0, moved!)
    setPinned(next)
    setSaved(false)
    setDragIdx(null)
    dragOver.current = null
  }

  const handleDragEnd = () => {
    setDragIdx(null)
    dragOver.current = null
  }

  const unpin   = (id: string) => { setPinned((p) => p.filter((x) => x !== id)); setSaved(false) }
  const pinPiece = (id: string) => {
    if (pinned.length >= MAX_PINNED) return
    setPinned((p) => [...p, id])
    setSaved(false)
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[0.82rem] text-parchment-dim mb-1">
          Pin up to <span className="text-gold font-medium">{MAX_PINNED}</span> public pieces to highlight on your profile.
          Drag to reorder.
        </p>
        <p className="text-[0.75rem] text-stone-light">{pinned.length}/{MAX_PINNED} pinned</p>
      </div>

      {/* ── Pinned order row ─────────────────────────────────────────────── */}
      <div>
        <p className="text-[0.68rem] font-medium tracking-[0.16em] uppercase text-gold mb-3">Pinned order</p>
        {pinnedPieces.length === 0 ? (
          <div className="border border-dashed border-gold/15 rounded-sm px-6 py-8 text-center text-[0.82rem] text-stone-light">
            No pinned pieces yet — select from below.
          </div>
        ) : (
          <div className="flex gap-4 flex-wrap">
            {pinnedPieces.map((p, i) => (
              <div
                key={p.artworkId}
                draggable
                onDragStart={() => handleDragStart(i)}
                onDragOver={(e) => handleDragOver(e, i)}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                className={`relative w-28 cursor-grab active:cursor-grabbing select-none transition-opacity duration-150 ${
                  dragIdx === i ? 'opacity-40' : 'opacity-100'
                }`}
              >
                {/* Drag handle indicator */}
                <div className="absolute top-2 left-2 z-10 flex flex-col gap-0.5 opacity-60">
                  <div className="w-3 h-px bg-gold" />
                  <div className="w-3 h-px bg-gold" />
                  <div className="w-3 h-px bg-gold" />
                </div>

                <div className="aspect-[4/5] bg-ink border border-gold/30 rounded-sm overflow-hidden">
                  {p.thumbnailUrl ? (
                    <img src={p.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-ink-raised" />
                  )}
                </div>

                <p className="mt-1.5 text-[0.72rem] text-parchment-dim line-clamp-1">{p.title}</p>

                <button
                  onClick={() => unpin(p.artworkId)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-ink border border-gold/25 text-stone-light hover:text-[#c0544a] hover:border-[#c0544a]/40 transition-colors text-[0.7rem] leading-none flex items-center justify-center"
                  title="Unpin"
                >
                  ×
                </button>

                <span className="absolute bottom-8 left-2 text-[0.58rem] font-mono text-gold/60">
                  #{i + 1}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Unpinned pieces grid ──────────────────────────────────────────── */}
      <div>
        <p className="text-[0.68rem] font-medium tracking-[0.16em] uppercase text-stone-light mb-3">
          Your public pieces
        </p>

        {isFetching && unpinned.length === 0 && publicPieces.length === 0 ? (
          <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="animate-pulse aspect-[4/5] bg-ink-soft border border-gold/8 rounded-sm" />
            ))}
          </div>
        ) : unpinned.length === 0 ? (
          <p className="text-stone-light text-sm py-6 text-center">
            {publicPieces.length === 0 ? 'No public pieces available to pin.' : 'All public pieces are pinned.'}
          </p>
        ) : (
          <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
            {unpinned.map((p) => {
              const disabled = pinned.length >= MAX_PINNED
              return (
                <button
                  key={p.artworkId}
                  onClick={() => pinPiece(p.artworkId)}
                  disabled={disabled}
                  title={disabled ? 'Remove a pinned piece first' : `Pin "${p.title}"`}
                  className={`relative text-left rounded-sm border transition-all overflow-hidden ${
                    disabled
                      ? 'border-gold/[0.06] opacity-35 cursor-not-allowed'
                      : 'border-gold/10 hover:border-gold/35 bg-ink-soft hover:bg-gold/[0.03] cursor-pointer'
                  }`}
                >
                  <div className="aspect-[4/5] w-full bg-ink overflow-hidden">
                    {p.thumbnailUrl ? (
                      <img src={p.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-ink-raised" />
                    )}
                  </div>
                  <div className="p-2">
                    <p className="text-[0.72rem] text-parchment line-clamp-1">{p.title}</p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Save ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => savePinned.mutate(pinned)}
          disabled={savePinned.isPending}
          className="bg-gold hover:bg-gold-light text-ink font-body text-sm font-medium uppercase tracking-[0.04em] px-8 py-[0.9rem] rounded-sm transition-colors duration-150 hover:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0"
        >
          {savePinned.isPending ? 'Saving…' : 'Save Pinned Pieces'}
        </button>
        {saved && <p className="text-[0.8rem] text-[#5a9e6e]">Saved.</p>}
        {savePinned.isError && (
          <p className="text-[0.8rem] text-[#c0544a]">Failed to save. Please try again.</p>
        )}
      </div>
    </div>
  )
}
