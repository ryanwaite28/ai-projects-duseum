// =============================================================================
// frontend/src/components/__tests__/ArtworkGrid.test.tsx
// Component tests for ArtworkGrid — FR-TESTING-05
//
// Verifies the grid dispatches to the correct card component based on accessTier.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '../../test/test-utils'
import { ArtworkGrid } from '../artwork/ArtworkGrid'
import type { ArtworkListItem } from '../../types/artwork'

// Mock LockedArtworkCard so we can assert it's rendered without needing its deps
vi.mock('../artwork/LockedArtworkCard', () => ({
  LockedArtworkCard: ({ artwork }: { artwork: ArtworkListItem }) => (
    <div data-testid="locked-card" data-artwork-id={artwork.artworkId}>
      Locked: {artwork.title}
    </div>
  ),
}))

vi.mock('../../store/auth.store', () => ({
  useAuthStore: vi.fn().mockReturnValue({ user: null, isLoading: false }),
}))

const makeArtwork = (
  artworkId: string,
  accessTier: ArtworkListItem['accessTier'],
  title = `Piece ${artworkId}`
): ArtworkListItem => ({
  artworkId,
  title,
  authorId:          'author-001',
  authorDisplayName: 'Test Author',
  category:          'DIGITAL',
  tags:              [],
  thumbnailUrl:      `https://cdn.test/${artworkId}.jpg`,
  viewCount:         10,
  reactionCounts:    {},
  commentCount:      0,
  publishedAt:       '2025-01-01T00:00:00.000Z',
  accessTier,
})

beforeEach(() => vi.clearAllMocks())

describe('ArtworkGrid', () => {
  it('renders ArtworkCard for PUBLIC pieces', () => {
    const items = [makeArtwork('art-001', 'PUBLIC')]
    render(<ArtworkGrid items={items} />)
    // ArtworkCard renders a link to the artwork detail page
    expect(screen.getByRole('link', { name: /Piece art-001/i })).toBeInTheDocument()
    expect(screen.queryByTestId('locked-card')).not.toBeInTheDocument()
  })

  it('renders ArtworkCard for PRIVATE pieces (subscriber view)', () => {
    const items = [makeArtwork('art-002', 'PRIVATE')]
    render(<ArtworkGrid items={items} />)
    expect(screen.getByRole('link', { name: /Piece art-002/i })).toBeInTheDocument()
    expect(screen.queryByTestId('locked-card')).not.toBeInTheDocument()
  })

  it('renders LockedArtworkCard for REQUIRES_PLATFORM_SUB pieces', () => {
    const items = [makeArtwork('art-003', 'REQUIRES_PLATFORM_SUB', 'Locked Piece')]
    render(<ArtworkGrid items={items} />)
    const lockedCard = screen.getByTestId('locked-card')
    expect(lockedCard).toBeInTheDocument()
    expect(lockedCard).toHaveAttribute('data-artwork-id', 'art-003')
    expect(screen.queryByRole('link', { name: /Locked Piece/i })).not.toBeInTheDocument()
  })

  it('renders a mix of card types when the list has mixed access tiers', () => {
    const items = [
      makeArtwork('art-pub',   'PUBLIC'),
      makeArtwork('art-priv',  'PRIVATE'),
      makeArtwork('art-lock',  'REQUIRES_PLATFORM_SUB'),
    ]
    render(<ArtworkGrid items={items} />)

    expect(screen.getAllByRole('link')).toHaveLength(2) // PUBLIC + PRIVATE
    expect(screen.getAllByTestId('locked-card')).toHaveLength(1)
  })

  it('renders nothing when items array is empty', () => {
    const { container } = render(<ArtworkGrid items={[]} />)
    // Grid container exists but has no children besides the grid wrapper
    expect(container.querySelectorAll('a')).toHaveLength(0)
    expect(container.querySelectorAll('[data-testid="locked-card"]')).toHaveLength(0)
  })

  it('renders all items when the list has multiple PUBLIC pieces', () => {
    const items = Array.from({ length: 6 }, (_, i) =>
      makeArtwork(`art-${i}`, 'PUBLIC', `Piece ${i}`)
    )
    render(<ArtworkGrid items={items} />)
    expect(screen.getAllByRole('link')).toHaveLength(6)
  })
})
