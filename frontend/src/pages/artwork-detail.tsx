import { useParams, useLocation, Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { GoldDivider } from '../components/ui/GoldDivider'
import { PageLayout } from '../components/layout/PageLayout'
import { ReactionBar } from '../components/social/ReactionBar'
import { CommentThread } from '../components/social/CommentThread'
import { useArtwork } from '../hooks/use-artwork'
import { ApiError } from '../services/api'

const PaymentRequiredOverlay = ({ authorId }: { authorId?: string }) => (
  <div className="aspect-[4/5] max-w-lg mx-auto bg-ink-soft border border-gold/10 rounded-sm flex flex-col items-center justify-center gap-5">
    <div className="text-[2.5rem] opacity-60">🔒</div>
    <div className="text-center px-8">
      {authorId ? (
        <>
          <p className="font-display italic text-parchment-dim text-[0.95rem] leading-snug mb-1">
            This piece is in the author's private section.
          </p>
          <p className="text-[0.78rem] font-light text-stone-light">Subscribe to this author to unlock access.</p>
        </>
      ) : (
        <>
          <p className="font-display italic text-parchment-dim text-[0.95rem] leading-snug mb-1">
            This piece requires a platform subscription.
          </p>
          <p className="text-[0.78rem] font-light text-stone-light">Upgrade your plan to unlock all artworks.</p>
        </>
      )}
    </div>
    {authorId ? (
      <Link to={`/authors/${authorId}`}>
        <Button variant="secondary">View author page</Button>
      </Link>
    ) : (
      <Link to="/subscriptions">
        <Button variant="primary">Upgrade plan</Button>
      </Link>
    )}
  </div>
)

export default function ArtworkDetailPage() {
  const { artworkId } = useParams<{ artworkId: string }>()
  const location = useLocation()
  const { data: artwork, isLoading, error } = useArtwork(artworkId ?? '')

  const isPaymentRequired =
    error instanceof ApiError && error.status === 402

  const authorIdFromState = (location.state as { authorId?: string } | null)?.authorId

  if (isLoading) {
    return (
      <PageLayout>
        <div className="min-h-screen py-32 px-8 bg-ink animate-pulse">
          <div className="max-w-[1100px] mx-auto grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-16">
            <div className="aspect-[4/5] bg-ink-soft border border-gold/10 rounded-sm" />
            <div className="flex flex-col gap-4 pt-4">
              <div className="h-3 bg-ink-soft rounded-sm w-24" />
              <div className="h-8 bg-ink-soft rounded-sm w-3/4" />
              <div className="h-4 bg-ink-soft rounded-sm w-full mt-4" />
              <div className="h-4 bg-ink-soft rounded-sm w-5/6" />
            </div>
          </div>
        </div>
      </PageLayout>
    )
  }

  if (isPaymentRequired) {
    return (
      <PageLayout>
        <section className="min-h-screen py-32 px-8 bg-ink">
          <div className="max-w-[1100px] mx-auto">
            <PaymentRequiredOverlay authorId={authorIdFromState} />
          </div>
        </section>
      </PageLayout>
    )
  }

  if (error || !artwork) {
    return (
      <PageLayout>
        <section className="min-h-screen py-32 px-8 bg-ink flex items-center justify-center">
          <p className="text-[0.88rem] font-light text-stone-light">Artwork not found.</p>
        </section>
      </PageLayout>
    )
  }

  const totalReactions = Object.values(artwork.reactionCounts).reduce((a, b) => a + (b ?? 0), 0)

  return (
    <PageLayout>
      <section className="min-h-screen py-32 px-8 bg-ink">
        <div className="max-w-[1100px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-16 items-start">
            {/* Image */}
            <div>
              {artwork.imageUrl ? (
                <div className="border border-gold/10 rounded-sm overflow-hidden bg-ink-soft">
                  <img
                    src={artwork.imageUrl}
                    alt={artwork.title}
                    className="w-full object-contain max-h-[80vh]"
                  />
                </div>
              ) : (
                <div className="aspect-[4/5] bg-ink-soft border border-gold/10 rounded-sm flex items-center justify-center">
                  <span className="font-display italic text-stone-light text-sm">No image available</span>
                </div>
              )}
            </div>

            {/* Metadata */}
            <div className="lg:sticky lg:top-28">
              <div className="flex items-center gap-3 mb-4">
                <Badge variant="gold">{artwork.category.replace('_', ' ')}</Badge>
                {artwork.visibility === 'PRIVATE' && (
                  <Badge variant="muted">Private</Badge>
                )}
              </div>

              <h1 className="font-display text-[clamp(1.5rem,3vw,2.2rem)] font-normal text-warm-white leading-[1.12] mb-2">
                {artwork.title}
              </h1>

              <Link
                to={`/authors/${artwork.authorId}`}
                className="text-[0.85rem] font-light text-gold hover:text-gold-light transition-colors duration-200"
              >
                {artwork.authorDisplayName}
              </Link>

              <GoldDivider />

              {artwork.description && (
                <p className="text-[0.88rem] font-light text-stone-light leading-[1.8] mb-6">
                  {artwork.description}
                </p>
              )}

              {/* Tags */}
              {artwork.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-6">
                  {artwork.tags.map((t) => (
                    <Link
                      key={t}
                      to={`/browse?tag=${t}`}
                      className="font-mono text-[0.72rem] text-stone-light bg-white/[0.03] border border-gold/12 px-3 py-1 rounded-sm hover:border-gold/30 hover:text-parchment transition-all duration-200"
                    >
                      {t}
                    </Link>
                  ))}
                </div>
              )}

              {/* Stats */}
              <div className="flex items-center gap-6 mb-6 text-[0.78rem] font-light text-stone-light">
                <span>{artwork.viewCount.toLocaleString()} views</span>
                {totalReactions > 0 && <span>{totalReactions} reactions</span>}
                {artwork.commentCount > 0 && <span>{artwork.commentCount} comments</span>}
              </div>

              {/* Reactions */}
              <ReactionBar artwork={artwork} activeReaction={artwork.viewerReaction} className="mb-8" />

              {/* Meta */}
              {artwork.publishedAt && (
                <p className="text-[0.72rem] font-light text-stone-light">
                  Published {new Date(artwork.publishedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              )}
            </div>
          </div>

          {/* Comment thread */}
          <div className="mt-20 pt-10 border-t border-gold/10">
            <CommentThread
              artworkId={artwork.artworkId}
              artworkAuthorId={artwork.authorId}
              commentCount={artwork.commentCount}
              commentsEnabled={artwork.commentsEnabled}
            />
          </div>
        </div>
      </section>
    </PageLayout>
  )
}
