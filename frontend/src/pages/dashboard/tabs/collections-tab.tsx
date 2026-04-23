import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useMe } from '../../../hooks/use-me'
import { listArtworks } from '../../../services/artworks.service'
import { collectionsService } from '../../../services/collections.service'
import type { AuthorCollection } from '../../../types/artwork'
import type { CollectionBody, CollectionPiece } from '../../../services/collections.service'

// ── New / Edit collection modal ───────────────────────────────────────────────

function CollectionModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: AuthorCollection
  onClose: () => void
  onSaved: () => void
}) {
  const [title,       setTitle]       = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [visibility,  setVisibility]  = useState<'PUBLIC' | 'PRIVATE'>(initial?.visibility ?? 'PUBLIC')
  const [error,       setError]       = useState<string | null>(null)

  const save = useMutation({
    mutationFn: () => {
      const body: CollectionBody = { title, description: description || undefined, visibility }
      return initial
        ? collectionsService.update(initial.collectionId, body)
        : collectionsService.create(body)
    },
    onSuccess: () => { onSaved(); onClose() },
    onError:   () => setError('Failed to save collection.'),
  })

  const inputCls = 'w-full bg-ink border border-gold/20 focus:border-gold/50 outline-none text-parchment text-[0.85rem] px-3 py-2 rounded-sm transition-colors'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-ink/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-ink-soft border border-gold/10 rounded-sm p-6 w-full max-w-sm">
        <p className="text-[0.68rem] font-medium tracking-[0.18em] uppercase text-gold mb-4">
          {initial ? 'Edit Collection' : 'New Collection'}
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-[0.68rem] tracking-[0.14em] uppercase text-stone-light mb-1">Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-[0.68rem] tracking-[0.14em] uppercase text-stone-light mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className={`${inputCls} resize-none`}
            />
          </div>
          <div>
            <label className="block text-[0.68rem] tracking-[0.14em] uppercase text-stone-light mb-1">Visibility</label>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as 'PUBLIC' | 'PRIVATE')}
              className={`${inputCls} appearance-none cursor-pointer`}
            >
              <option value="PUBLIC">Public</option>
              <option value="PRIVATE">Private</option>
            </select>
          </div>
          {error && <p className="text-[0.8rem] text-[#c0544a]">{error}</p>}
        </div>

        <div className="mt-5 flex gap-3">
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending || !title.trim()}
            className="flex-1 bg-gold hover:bg-gold-light text-ink font-body text-sm font-medium uppercase tracking-[0.04em] py-[0.7rem] rounded-sm transition-colors disabled:opacity-60"
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 border border-gold/25 text-parchment-dim font-body text-sm uppercase tracking-[0.04em] py-[0.7rem] rounded-sm hover:border-gold/50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Manage pieces modal ───────────────────────────────────────────────────────

function ManagePiecesModal({
  collection,
  authorId,
  onClose,
  onSaved,
}: {
  collection: AuthorCollection
  authorId:   string
  onClose:    () => void
  onSaved:    () => void
}) {
  const qc = useQueryClient()

  const { data: piecesRes } = useQuery({
    queryKey: ['collections', collection.collectionId, 'pieces'],
    queryFn:  () => collectionsService.listPieces(collection.collectionId),
  })

  const { data: myArtworks } = useQuery({
    queryKey: ['artworks', 'mine', 'all'],
    queryFn:  () => listArtworks({ authorId, limit: 100 }),
    enabled:  !!authorId,
  })

  const currentPieces: CollectionPiece[] = piecesRes?.pieces ?? []
  const currentIds = new Set(currentPieces.map((p) => p.artworkId))

  const addPiece = useMutation({
    mutationFn: (artworkId: string) =>
      collectionsService.addPiece(collection.collectionId, artworkId, currentPieces.length + 1),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collections', collection.collectionId, 'pieces'] }),
  })

  const removePiece = useMutation({
    mutationFn: (artworkId: string) => collectionsService.removePiece(collection.collectionId, artworkId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collections', collection.collectionId, 'pieces'] }),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-ink/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-ink-soft border border-gold/10 rounded-sm p-6 w-full max-w-md max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[0.68rem] font-medium tracking-[0.18em] uppercase text-gold">
            Manage Pieces — {collection.title}
          </p>
          <button onClick={onClose} className="text-stone-light hover:text-parchment text-lg leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2">
          {(myArtworks?.items ?? []).map((artwork) => {
            const inCollection = currentIds.has(artwork.artworkId)
            return (
              <label
                key={artwork.artworkId}
                className="flex items-center gap-3 p-3 bg-ink rounded-sm border border-gold/[0.06] cursor-pointer hover:border-gold/20 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={inCollection}
                  onChange={() =>
                    inCollection
                      ? removePiece.mutate(artwork.artworkId)
                      : addPiece.mutate(artwork.artworkId)
                  }
                  className="w-4 h-4 accent-gold flex-shrink-0"
                />
                {artwork.thumbnailUrl ? (
                  <img src={artwork.thumbnailUrl} alt="" className="w-8 h-8 object-cover rounded-sm border border-gold/10 flex-shrink-0" />
                ) : (
                  <div className="w-8 h-8 bg-ink-soft border border-gold/10 rounded-sm flex-shrink-0" />
                )}
                <span className="text-[0.82rem] text-parchment line-clamp-1">{artwork.title}</span>
              </label>
            )
          })}
        </div>

        <div className="mt-4 pt-4 border-t border-gold/10">
          <button
            onClick={() => { onSaved(); onClose() }}
            className="w-full bg-gold hover:bg-gold-light text-ink font-body text-sm font-medium uppercase tracking-[0.04em] py-[0.7rem] rounded-sm transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Collections tab ───────────────────────────────────────────────────────────

export function CollectionsTab() {
  const qc = useQueryClient()
  const { data: me } = useMe()
  const userId = me?.account.userId ?? ''

  const [showNew,      setShowNew]      = useState(false)
  const [editing,      setEditing]      = useState<AuthorCollection | null>(null)
  const [managing,     setManaging]     = useState<AuthorCollection | null>(null)
  const [confirmDel,   setConfirmDel]   = useState<AuthorCollection | null>(null)

  const { data, isFetching } = useQuery({
    queryKey: ['collections', 'mine', userId],
    queryFn:  () => collectionsService.listMy(userId),
    enabled:  !!userId,
  })

  const collections = data?.collections ?? []

  const invalidate = () => qc.invalidateQueries({ queryKey: ['collections', 'mine', userId] })

  const deleteCol = useMutation({
    mutationFn: (id: string) => collectionsService.delete(id),
    onSuccess:  () => { setConfirmDel(null); invalidate() },
  })

  return (
    <>
      {showNew  && <CollectionModal onClose={() => setShowNew(false)} onSaved={invalidate} />}
      {editing  && <CollectionModal initial={editing} onClose={() => setEditing(null)} onSaved={invalidate} />}
      {managing && <ManagePiecesModal collection={managing} authorId={userId} onClose={() => setManaging(null)} onSaved={invalidate} />}

      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-ink/70 backdrop-blur-sm" onClick={() => setConfirmDel(null)} />
          <div className="relative bg-ink-soft border border-gold/10 rounded-sm p-6 max-w-sm w-full">
            <p className="text-[0.68rem] font-medium tracking-[0.18em] uppercase text-[#c0544a] mb-2">Delete Collection</p>
            <p className="text-parchment text-sm mb-1">"{confirmDel.title}"</p>
            <p className="text-stone-light text-[0.8rem] mb-6">The collection will be removed. Artworks are not deleted.</p>
            <div className="flex gap-3">
              <button
                onClick={() => deleteCol.mutate(confirmDel.collectionId)}
                disabled={deleteCol.isPending}
                className="flex-1 bg-[#c0544a] hover:bg-[#d0645a] text-warm-white font-body text-sm font-medium uppercase tracking-[0.04em] py-[0.7rem] rounded-sm transition-colors disabled:opacity-60"
              >
                {deleteCol.isPending ? 'Deleting…' : 'Delete'}
              </button>
              <button
                onClick={() => setConfirmDel(null)}
                className="flex-1 border border-gold/25 text-parchment-dim font-body text-sm uppercase tracking-[0.04em] py-[0.7rem] rounded-sm hover:border-gold/50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-5">
        <p className="text-[0.68rem] font-medium tracking-[0.16em] uppercase text-stone-light">
          {collections.length} Collection{collections.length !== 1 ? 's' : ''}
        </p>
        <button
          onClick={() => setShowNew(true)}
          className="text-gold border border-gold/40 hover:border-gold hover:bg-gold/10 font-body text-[0.8rem] font-medium uppercase tracking-[0.04em] px-[1.1rem] py-[0.45rem] rounded-md transition-all"
        >
          + New Collection
        </button>
      </div>

      {isFetching && collections.length === 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse h-36 bg-ink-soft border border-gold/8 rounded-sm" />
          ))}
        </div>
      ) : collections.length === 0 ? (
        <div className="py-12 text-center text-stone-light text-sm">No collections yet.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {collections.map((col) => (
            <div
              key={col.collectionId}
              className="bg-ink-soft border border-gold/10 rounded-sm p-5 flex flex-col gap-3 hover:border-gold/25 transition-colors"
            >
              <div className="flex-1">
                <p className="text-[0.82rem] font-medium text-parchment mb-1 line-clamp-1">{col.title}</p>
                {col.description && (
                  <p className="text-[0.75rem] text-stone-light line-clamp-2">{col.description}</p>
                )}
                <p className="mt-2 text-[0.68rem] text-stone-light">
                  {col.pieceCount} piece{col.pieceCount !== 1 ? 's' : ''} ·{' '}
                  <span className={col.visibility === 'PUBLIC' ? 'text-[#5a9e6e]' : 'text-gold'}>
                    {col.visibility}
                  </span>
                </p>
              </div>
              <div className="flex gap-3 border-t border-gold/[0.06] pt-3">
                <button
                  onClick={() => setManaging(col)}
                  className="text-[0.72rem] font-medium uppercase tracking-[0.06em] text-gold hover:text-gold-light transition-colors"
                >
                  Pieces
                </button>
                <button
                  onClick={() => setEditing(col)}
                  className="text-[0.72rem] font-medium uppercase tracking-[0.06em] text-stone-light hover:text-parchment transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => setConfirmDel(col)}
                  className="text-[0.72rem] font-medium uppercase tracking-[0.06em] text-[#c0544a] hover:text-[#d0645a] transition-colors ml-auto"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
