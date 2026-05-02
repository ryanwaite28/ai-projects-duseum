import { useParams } from 'react-router-dom'
import { EyebrowLabel } from '../components/ui/EyebrowLabel'
import { GoldDivider } from '../components/ui/GoldDivider'
import { PageLayout } from '../components/layout/PageLayout'
import { ArtworkGrid } from '../components/artwork/ArtworkGrid'
import { FollowButton } from '../components/social/FollowButton'
import { AuthorSubscribeCTA } from '../components/subscription/AuthorSubscribeCTA'
import { useAuthor, useAuthorCollections } from '../hooks/use-author'
import { useSubscriptions } from '../hooks/use-subscriptions'

export default function AuthorProfilePage() {
  const { authorId } = useParams<{ authorId: string }>()

  const { data: author, isLoading, error } = useAuthor(authorId ?? '')
  const { data: collectionsData } = useAuthorCollections(authorId ?? '')
  const collections = collectionsData?.items ?? []

  const { hasAuthorSub } = useSubscriptions()
  const alreadySubscribed = authorId ? hasAuthorSub(authorId) : false

  if (isLoading) {
    return (
      <PageLayout>
        <div className="min-h-screen bg-ink animate-pulse">
          {/* Cover skeleton */}
          <div className="h-64 bg-ink-soft" />
          <div className="max-w-[1100px] mx-auto px-8 py-12">
            <div className="h-8 bg-ink-soft rounded-sm w-48 mb-4" />
            <div className="h-4 bg-ink-soft rounded-sm w-full max-w-md mb-2" />
            <div className="h-4 bg-ink-soft rounded-sm w-3/4 max-w-sm" />
          </div>
        </div>
      </PageLayout>
    )
  }

  if (error || !author) {
    return (
      <PageLayout>
        <section className="min-h-screen py-32 px-8 bg-ink flex items-center justify-center">
          <p className="text-[0.88rem] font-light text-stone-light">Author not found.</p>
        </section>
      </PageLayout>
    )
  }

  const hasSubscription =
    author.authorSubscriptionPriceUsd != null && author.connectChargesEnabled === true

  return (

    <PageLayout>
      {/* Cover photo */}
      <div className="relative h-72 bg-ink-soft overflow-hidden">
        {author.coverPhotoUrl ? (
          <img
            src={author.coverPhotoUrl}
            alt={`${author.displayName} cover`}
            className="w-full h-full object-cover opacity-60"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(ellipse 80% 80% at 50% 120%, rgba(200,151,58,0.08) 0%, transparent 70%)',
            }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
      </div>

      {/* Profile header */}
      <section className="py-12 px-8 bg-ink border-t border-gold/10">
        <div className="max-w-[1100px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-12 items-start">
            <div>
              <EyebrowLabel>Author</EyebrowLabel>
              <h1 className="font-display text-[clamp(2rem,4vw,3rem)] font-normal text-warm-white leading-[1.12] mb-4">
                {author.displayName}
              </h1>
              <GoldDivider />
              <p className="text-[0.92rem] font-light text-stone-light leading-[1.8] max-w-xl">
                {author.bio}
              </p>

              <div className="flex items-center gap-8 mt-8">
                <div>
                  <span className="font-display text-[1.8rem] text-warm-white block">{author.followerCount.toLocaleString()}</span>
                  <span className="text-[0.68rem] font-medium tracking-[0.14em] uppercase text-stone-light">Followers</span>
                </div>
                <div className="w-px h-10 bg-gold/15" />
                <div>
                  <span className="font-display text-[1.8rem] text-warm-white block">{author.subscriberCount.toLocaleString()}</span>
                  <span className="text-[0.68rem] font-medium tracking-[0.14em] uppercase text-stone-light">Subscribers</span>
                </div>
              </div>
            </div>

            {/* Subscription CTA */}
            <div className="lg:pt-16">
              <div className="bg-ink-soft border border-gold/15 rounded-sm p-6">
                <p className="text-[0.68rem] font-medium tracking-[0.14em] uppercase text-gold mb-3">
                  {hasSubscription ? 'Support this author' : 'Follow for updates'}
                </p>
                <div className="flex flex-col gap-3">
                  <FollowButton authorId={authorId!} className="w-full" />
                  {hasSubscription && author.authorSubscriptionPriceUsd != null && (
                    <AuthorSubscribeCTA
                      authorId={authorId!}
                      authorDisplayName={author.displayName}
                      priceUsd={author.authorSubscriptionPriceUsd}
                      connectChargesEnabled={author.connectChargesEnabled}
                      alreadySubscribed={alreadySubscribed}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Public gallery */}
      <section className="py-20 px-8 bg-ink-soft border-t border-gold/10">
        <div className="max-w-[1100px] mx-auto">
          <div className="mb-10">
            <EyebrowLabel>Gallery</EyebrowLabel>
            <h2 className="font-display text-[1.8rem] font-normal text-warm-white">
              Public works
            </h2>
          </div>

          {author.recentPieces.length === 0 ? (
            <p className="text-[0.88rem] font-light text-stone-light py-12 text-center">
              No published pieces yet.
            </p>
          ) : (
            <ArtworkGrid items={author.recentPieces} />
          )}
        </div>
      </section>

      {/* Collections */}
      {collections.length > 0 && (
        <section className="py-20 px-8 bg-ink border-t border-gold/10">
          <div className="max-w-[1100px] mx-auto">
            <div className="mb-10">
              <EyebrowLabel>Collections</EyebrowLabel>
              <h2 className="font-display text-[1.8rem] font-normal text-warm-white">
                Curated series
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {collections.map((col) => (
                <div
                  key={col.collectionId}
                  className="bg-ink-soft border border-gold/10 rounded-sm overflow-hidden group hover:border-gold/25 transition-colors duration-200"
                >
                  {col.coverPieceUrl ? (
                    <div className="aspect-[16/9] overflow-hidden">
                      <img
                        src={col.coverPieceUrl}
                        alt={col.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    </div>
                  ) : (
                    <div className="aspect-[16/9] bg-ink flex items-center justify-center">
                      <span className="font-display italic text-stone-light text-xs">No cover</span>
                    </div>
                  )}
                  <div className="p-5">
                    <h3 className="font-display text-[1rem] font-semibold text-warm-white mb-1">{col.title}</h3>
                    {col.description && (
                      <p className="text-[0.78rem] font-light text-stone-light line-clamp-2 mb-3">{col.description}</p>
                    )}
                    <span className="text-[0.68rem] font-medium tracking-[0.12em] uppercase text-stone-light">
                      {col.pieceCount} piece{col.pieceCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </PageLayout>
  )
}
