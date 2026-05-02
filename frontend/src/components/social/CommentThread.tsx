import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../ui/Button'
import { useAuthStore } from '../../store/auth.store'
import { useMe } from '../../hooks/use-me'
import { useComments, usePostComment, useDeleteComment, usePinComment, useAllComments } from '../../hooks/use-comments'
import type { ArtworkComment } from '../../types/artwork'

// ── Comment form ──────────────────────────────────────────────────────────────

interface CommentFormProps {
  artworkId:        string
  parentCommentId?: string
  placeholder?:     string
  onCancel?:        () => void
}

const CommentForm = ({ artworkId, parentCommentId, placeholder = 'Leave a comment…', onCancel }: CommentFormProps) => {
  const [body, setBody] = useState('')
  const post = usePostComment(artworkId)

  const submit = () => {
    const trimmed = body.trim()
    if (!trimmed) return
    post.mutate({ body: trimmed, parentCommentId }, {
      onSuccess: () => { setBody(''); onCancel?.() },
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <textarea
        rows={parentCommentId ? 2 : 3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={1000}
        placeholder={placeholder}
        className="w-full bg-ink-soft border border-gold/20 focus:border-gold/50 rounded-sm px-4 py-3 text-[0.88rem] font-light text-parchment placeholder:text-stone-light outline-none transition-colors duration-200 resize-none"
      />
      <div className="flex items-center justify-between">
        <span className="text-[0.7rem] font-light text-stone-light">{1000 - body.length} remaining</span>
        <div className="flex gap-2">
          {onCancel && <Button variant="ghost" onClick={onCancel} className="text-[0.72rem] px-3 py-1.5">Cancel</Button>}
          <Button variant="ghost" onClick={submit} disabled={!body.trim() || post.isPending}>
            {post.isPending ? '…' : 'Post'}
          </Button>
        </div>
      </div>
      {post.isError && <p className="text-[0.72rem] text-[#c0544a]">Failed to post. Try again.</p>}
    </div>
  )
}

// ── Single comment ────────────────────────────────────────────────────────────

interface CommentItemProps {
  comment:       ArtworkComment
  artworkId:     string
  artworkAuthorId: string
  replies:       ArtworkComment[]
  isAdmin:       boolean
  pinnedCount:   number
}

const CommentItem = ({ comment, artworkId, artworkAuthorId, replies, isAdmin, pinnedCount }: CommentItemProps) => {
  const { user }   = useAuthStore()
  const [replying, setReplying] = useState(false)
  const del = useDeleteComment(artworkId)
  const pin = usePinComment(artworkId)

  const isAuthorOfPiece = !!user && user.userId === artworkAuthorId
  const canDelete = !!user && (user.userId === comment.authorId || isAuthorOfPiece || isAdmin)
  const canPin    = isAuthorOfPiece && !comment.parentCommentId
  const canPinMore = pinnedCount < 2 || comment.isPinned

  return (
    <div className={`flex gap-3 ${comment.isPinned ? 'pl-3 border-l-2 border-gold/50' : ''}`}>
      <div className="w-7 h-7 flex-shrink-0 rounded-full bg-ink-soft border border-gold/15 flex items-center justify-center text-[0.6rem] font-medium text-stone-light">
        {comment.authorDisplayName.slice(0, 2).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[0.78rem] font-medium text-parchment">{comment.authorDisplayName}</span>
          {comment.isPinned && (
            <span className="text-[0.6rem] font-medium tracking-[0.12em] uppercase text-gold bg-gold/10 px-1.5 py-0.5 rounded-sm">Pinned</span>
          )}
          <span className="text-[0.7rem] font-light text-stone-light ml-auto">
            {new Date(comment.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        </div>

        <p className="text-[0.85rem] font-light text-parchment-dim leading-[1.7]">{comment.body}</p>

        <div className="flex items-center gap-4 mt-2">
          {user && !comment.parentCommentId && (
            <button onClick={() => setReplying((v) => !v)} className="text-[0.7rem] font-light text-stone-light hover:text-gold transition-colors">
              {replying ? 'Cancel' : 'Reply'}
            </button>
          )}
          {canPin && canPinMore && (
            <button
              onClick={() => pin.mutate(comment.commentId)}
              disabled={pin.isPending}
              className="text-[0.7rem] font-light text-stone-light hover:text-gold transition-colors disabled:opacity-50"
            >
              {comment.isPinned ? 'Unpin' : 'Pin'}
            </button>
          )}
          {canDelete && (
            <button onClick={() => del.mutate(comment.commentId)} disabled={del.isPending} className="text-[0.7rem] font-light text-stone-light hover:text-[#c0544a] transition-colors">
              Delete
            </button>
          )}
        </div>

        {replying && (
          <div className="mt-3">
            <CommentForm artworkId={artworkId} parentCommentId={comment.commentId} placeholder={`Reply to ${comment.authorDisplayName}…`} onCancel={() => setReplying(false)} />
          </div>
        )}

        {replies.length > 0 && (
          <div className="mt-4 pl-4 border-l border-gold/10 flex flex-col gap-4">
            {replies.map((r) => (
              <div key={r.commentId} className="flex gap-3">
                <div className="w-6 h-6 flex-shrink-0 rounded-full bg-ink-soft border border-gold/15 flex items-center justify-center text-[0.55rem] font-medium text-stone-light">
                  {r.authorDisplayName.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[0.75rem] font-medium text-parchment">{r.authorDisplayName}</span>
                    <span className="text-[0.68rem] font-light text-stone-light ml-auto">
                      {new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <p className="text-[0.83rem] font-light text-parchment-dim leading-[1.7]">{r.body}</p>
                  {!!user && (user.userId === r.authorId || user.userId === artworkAuthorId || isAdmin) && (
                    <button onClick={() => del.mutate(r.commentId)} disabled={del.isPending} className="mt-1 text-[0.7rem] font-light text-stone-light hover:text-[#c0544a] transition-colors">
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Thread ────────────────────────────────────────────────────────────────────

interface CommentThreadProps {
  artworkId:       string
  artworkAuthorId: string
  commentCount:    number
  commentsEnabled: boolean
}

export const CommentThread = ({ artworkId, artworkAuthorId, commentCount, commentsEnabled }: CommentThreadProps) => {
  const { user }    = useAuthStore()
  const navigate    = useNavigate()
  const { data: me } = useMe()
  const isAdmin     = me?.account?.systemRole === 'ADMIN'

  const allComments = useAllComments(artworkId)
  const { hasNextPage, fetchNextPage, isFetchingNextPage } = useComments(artworkId)

  const pinned     = allComments.filter((c) => c.isPinned && !c.parentCommentId)
  const topLevel   = allComments.filter((c) => !c.isPinned && !c.parentCommentId)
  const replies    = allComments.filter((c) => !!c.parentCommentId)
  const getReplies = (id: string) => replies.filter((r) => r.parentCommentId === id)

  return (
    <div>
      <h2 className="font-display text-[1.3rem] font-normal text-warm-white mb-8">
        Comments <span className="text-stone-light text-[1rem] font-light ml-2">{commentCount}</span>
      </h2>

      {commentsEnabled ? (
        <div className="flex gap-4 mb-10">
          <div className="w-8 h-8 flex-shrink-0 rounded-full bg-ink-soft border border-gold/15 flex items-center justify-center text-[0.65rem] text-stone-light">
            {user ? user.email.slice(0, 1).toUpperCase() : '?'}
          </div>
          <div className="flex-1" onClick={!user ? () => navigate(`/login?return=/artworks/${artworkId}`) : undefined}>
            {user ? (
              <CommentForm artworkId={artworkId} />
            ) : (
              <div className="w-full bg-ink-soft border border-gold/20 rounded-sm px-4 py-3 text-[0.88rem] font-light text-stone-light cursor-pointer hover:border-gold/40 transition-colors">
                Sign in to leave a comment…
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="mb-10 px-4 py-3 bg-ink-soft border border-gold/10 rounded-sm">
          <p className="text-[0.82rem] font-light text-stone-light">Comments are disabled for this piece.</p>
        </div>
      )}

      {allComments.length === 0 ? (
        <p className="text-[0.82rem] font-light text-stone-light text-center py-8">No comments yet. Be the first.</p>
      ) : (
        <div className="flex flex-col gap-8">
          {pinned.map((c) => (
            <CommentItem
              key={c.commentId}
              comment={c}
              artworkId={artworkId}
              artworkAuthorId={artworkAuthorId}
              replies={getReplies(c.commentId)}
              isAdmin={isAdmin}
              pinnedCount={pinned.length}
            />
          ))}
          {pinned.length > 0 && topLevel.length > 0 && <div className="border-t border-gold/10" />}
          {topLevel.map((c) => (
            <CommentItem
              key={c.commentId}
              comment={c}
              artworkId={artworkId}
              artworkAuthorId={artworkAuthorId}
              replies={getReplies(c.commentId)}
              isAdmin={isAdmin}
              pinnedCount={pinned.length}
            />
          ))}
        </div>
      )}

      {hasNextPage && (
        <div className="mt-8 text-center">
          <button onClick={() => void fetchNextPage()} disabled={isFetchingNextPage} className="text-[0.78rem] font-light text-stone-light hover:text-gold transition-colors">
            {isFetchingNextPage ? 'Loading…' : 'Load more comments'}
          </button>
        </div>
      )}
    </div>
  )
}
