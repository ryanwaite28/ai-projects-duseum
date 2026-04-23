import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useMe, useMeQueryKey } from '../../../hooks/use-me'
import { listArtworks } from '../../../services/artworks.service'
import { api } from '../../../services/api'

const MAX_PINNED = 3

export function PinnedTab() {
  const qc = useQueryClient()
  const { data: me } = useMe()
  const userId = me?.account.userId ?? ''
  const currentPinned: string[] = me?.authorProfile?.featuredPieceIds ?? []

  const [selected, setSelected] = useState<string[]>(currentPinned)
  const [saved,    setSaved]    = useState(false)

  const { data: piecesRes, isFetching } = useQuery({
    queryKey: ['artworks', 'mine', 'all', userId],
    queryFn:  () => listArtworks({ authorId: userId, limit: 100 }),
    enabled:  !!userId,
    staleTime: 60_000,
  })

  const publicPieces = (piecesRes?.items ?? []).filter((p) => p.visibility === 'PUBLIC' || !p.visibility)

  const savePinned = useMutation({
    mutationFn: (featuredPieceIds: string[]) =>
      api.put<unknown>('/users/me/author', { featuredPieceIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: useMeQueryKey })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
  })

  const toggle = (artworkId: string) => {
    setSelected((prev) => {
      if (prev.includes(artworkId)) return prev.filter((id) => id !== artworkId)
      if (prev.length >= MAX_PINNED) return prev
      return [...prev, artworkId]
    })
    setSaved(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[0.82rem] text-parchment-dim mb-1">
          Pin up to <span className="text-gold font-medium">{MAX_PINNED}</span> public pieces to highlight on your profile.
        </p>
        <p className="text-[0.75rem] text-stone-light">
          {selected.length}/{MAX_PINNED} selected
        </p>
      </div>

      {isFetching && publicPieces.length === 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse h-24 bg-ink-soft border border-gold/8 rounded-sm" />
          ))}
        </div>
      ) : publicPieces.length === 0 ? (
        <p className="text-stone-light text-sm py-8 text-center">No public pieces available to pin.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {publicPieces.map((p) => {
            const isPinned = selected.includes(p.artworkId)
            const isDisabled = !isPinned && selected.length >= MAX_PINNED
            return (
              <button
                key={p.artworkId}
                onClick={() => toggle(p.artworkId)}
                disabled={isDisabled}
                className={`relative text-left rounded-sm border transition-all overflow-hidden ${
                  isPinned
                    ? 'border-gold bg-gold/[0.04]'
                    : isDisabled
                      ? 'border-gold/[0.06] opacity-40 cursor-not-allowed'
                      : 'border-gold/10 hover:border-gold/30 bg-ink-soft'
                }`}
              >
                <div className="aspect-video w-full bg-ink overflow-hidden">
                  {p.thumbnailUrl ? (
                    <img src={p.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-ink-raised" />
                  )}
                </div>
                <div className="p-3">
                  <p className="text-[0.78rem] text-parchment line-clamp-1">{p.title}</p>
                </div>
                {isPinned && (
                  <span className="absolute top-2 right-2 text-[0.6rem] font-medium tracking-[0.1em] uppercase text-gold bg-ink/80 border border-gold/30 px-1.5 py-0.5 rounded-sm">
                    Pinned
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      <div className="flex items-center gap-4">
        <button
          onClick={() => savePinned.mutate(selected)}
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
