// =============================================================================
// frontend/src/components/__tests__/ArtworkCard.test.tsx
// Component tests for ArtworkCard — FR-TESTING-05
//
// Verifies the three distinct rendering branches:
//   1. Public accessible piece  — image visible, no lock overlay
//   2. Inaccessible private     — blurred image + lock icon + "Private section"
//   3. PRIVATE badge            — badge shown when accessTier=PRIVATE, not inaccessible
// =============================================================================

import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '../../test/test-utils'
import { ArtworkCard } from '../artwork/ArtworkCard'
import type { ArtworkListItem } from '../../types/artwork'

const baseArtwork: ArtworkListItem = {
  artworkId:         'art-001',
  title:             'Test Piece',
  authorId:          'author-001',
  authorDisplayName: 'Test Author',
  category:          'DIGITAL',
  tags:              ['abstract'],
  thumbnailUrl:      'https://cdn.test/art-001.jpg',
  viewCount:         200,
  reactionCounts:    { LOVE: 5, FIRE: 3 },
  commentCount:      2,
  publishedAt:       '2025-03-01T00:00:00.000Z',
  accessTier:        'PUBLIC',
}

describe('ArtworkCard — public accessible piece', () => {
  it('renders the artwork title', () => {
    render(<ArtworkCard artwork={baseArtwork} />)
    expect(screen.getByText('Test Piece')).toBeInTheDocument()
  })

  it('renders the author display name', () => {
    render(<ArtworkCard artwork={baseArtwork} />)
    expect(screen.getByText('Test Author')).toBeInTheDocument()
  })

  it('renders the thumbnail image with correct src', () => {
    render(<ArtworkCard artwork={baseArtwork} />)
    const img = screen.getByRole('img', { name: 'Test Piece' })
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', 'https://cdn.test/art-001.jpg')
  })

  it('does not render the lock overlay when not inaccessible', () => {
    render(<ArtworkCard artwork={baseArtwork} />)
    expect(screen.queryByText('Private section')).not.toBeInTheDocument()
  })

  it('does not render a Private badge when accessTier is PUBLIC', () => {
    render(<ArtworkCard artwork={baseArtwork} />)
    expect(screen.queryByText('Private')).not.toBeInTheDocument()
  })

  it('links to the artwork detail page', () => {
    render(<ArtworkCard artwork={baseArtwork} />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/artworks/art-001')
  })
})

describe('ArtworkCard — inaccessible private piece (lock overlay)', () => {
  const inaccessibleArtwork: ArtworkListItem = {
    ...baseArtwork,
    accessTier: 'PRIVATE',
  }

  it('renders "Private section" lock overlay text', () => {
    render(<ArtworkCard artwork={inaccessibleArtwork} inaccessible />)
    expect(screen.getByText('Private section')).toBeInTheDocument()
  })

  it('renders the lock icon', () => {
    render(<ArtworkCard artwork={inaccessibleArtwork} inaccessible />)
    expect(screen.getByText('🔒')).toBeInTheDocument()
  })

  it('does not render an accessible img alt tag for the main image', () => {
    render(<ArtworkCard artwork={inaccessibleArtwork} inaccessible />)
    // The blurred background image has empty alt so it is decorative
    const images = document.querySelectorAll('img')
    const accessibleImage = Array.from(images).find(
      (img) => img.getAttribute('alt') === 'Test Piece'
    )
    expect(accessibleImage).toBeUndefined()
  })
})

describe('ArtworkCard — PRIVATE badge (accessible to subscriber)', () => {
  const privateArtwork: ArtworkListItem = {
    ...baseArtwork,
    accessTier: 'PRIVATE',
  }

  it('renders the "Private" badge when accessTier=PRIVATE and not inaccessible', () => {
    render(<ArtworkCard artwork={privateArtwork} inaccessible={false} />)
    expect(screen.getByText('Private')).toBeInTheDocument()
  })

  it('still renders the image normally (subscriber can see it)', () => {
    render(<ArtworkCard artwork={privateArtwork} inaccessible={false} />)
    const img = screen.getByRole('img', { name: 'Test Piece' })
    expect(img).toBeInTheDocument()
  })

  it('does not show lock overlay when inaccessible is false', () => {
    render(<ArtworkCard artwork={privateArtwork} inaccessible={false} />)
    expect(screen.queryByText('Private section')).not.toBeInTheDocument()
  })
})

describe('ArtworkCard — reaction and view stats', () => {
  it('renders total reaction count in hover overlay', () => {
    render(<ArtworkCard artwork={baseArtwork} />)
    // 5 LOVE + 3 FIRE = 8 total; displayed with the ♥ icon
    expect(screen.getByText(/8/)).toBeInTheDocument()
  })

  it('renders comment count in hover overlay when present', () => {
    render(<ArtworkCard artwork={baseArtwork} />)
    expect(screen.getByText(/2 comments/)).toBeInTheDocument()
  })

  it('renders view count formatted with toLocaleString', () => {
    const highViewArtwork = { ...baseArtwork, viewCount: 12_345 }
    render(<ArtworkCard artwork={highViewArtwork} />)
    expect(screen.getByText(/12,345 views/)).toBeInTheDocument()
  })
})
