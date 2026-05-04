// =============================================================================
// frontend/src/components/__tests__/DailyFeaturedSpotlight.test.tsx
// Regression: DailyFeaturedSpotlight was invisible on initial (non-cached) page
// loads because useReveal's IntersectionObserver effect fired while ref.current
// was null (ref attached to content section, not the skeleton branch).
// Fix: outer <section ref={ref}> is always rendered; skeleton/content are
// conditional children inside it.
// FR-TESTING-06
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '../../test/test-utils'
import { DailyFeaturedSpotlight } from '../home/DailyFeaturedSpotlight'
import type { DailyFeaturedResponse } from '../../types/features'

vi.mock('../../hooks/use-reveal', () => ({
  useReveal: () => ({ current: null }),
}))

const makeData = (overrides: Partial<DailyFeaturedResponse['author']> = {}): DailyFeaturedResponse => ({
  date:            '2026-05-04',
  selectionMethod: 'RANDOM',
  spotlightPieces: [],
  author: {
    authorId:                     'author-001',
    displayName:                  'Test Artist',
    bio:                          'A creative mind.',
    coverPhotoUrl:                null,
    followerCount:                42,
    subscriberCount:              5,
    authorSubscriptionMonthlyUsd: null,
    ...overrides,
  },
})

describe('DailyFeaturedSpotlight', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders skeleton when isLoading is true', () => {
    const { container } = render(
      <DailyFeaturedSpotlight isLoading={true} data={undefined} />
    )
    // Skeleton is an animate-pulse div; no author name rendered
    expect(container.querySelector('.animate-pulse')).toBeTruthy()
    expect(screen.queryByText('Test Artist')).toBeNull()
  })

  it('renders author content when isLoading is false and data is present — regression: initial load (not cached)', () => {
    // This is the scenario that was broken: isLoading starts false with data ready.
    // The outer section must always be in the DOM so useReveal fires correctly.
    render(<DailyFeaturedSpotlight isLoading={false} data={makeData()} />)
    expect(screen.getByText('Test Artist')).toBeInTheDocument()
    expect(screen.getByText(/A creative mind/)).toBeInTheDocument()
  })

  it('renders follower and subscriber counts when author is present', () => {
    render(<DailyFeaturedSpotlight isLoading={false} data={makeData()} />)
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('Followers')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('Subscribers')).toBeInTheDocument()
  })

  it('renders cover photo when coverPhotoUrl is provided', () => {
    render(
      <DailyFeaturedSpotlight
        isLoading={false}
        data={makeData({ coverPhotoUrl: 'https://cdn.test/cover.jpg' })}
      />
    )
    const img = screen.getByRole('img', { name: 'Test Artist' })
    expect(img).toHaveAttribute('src', 'https://cdn.test/cover.jpg')
  })

  it('renders fallback placeholder when author is null (no daily author selected yet)', () => {
    const data: DailyFeaturedResponse = {
      date:            '2026-05-04',
      selectionMethod: 'RANDOM',
      spotlightPieces: [],
      author:          null,
    }
    render(<DailyFeaturedSpotlight isLoading={false} data={data} />)
    expect(screen.getByText(/featured artist/i)).toBeInTheDocument()
    expect(screen.getByText('Browse Authors')).toBeInTheDocument()
  })

  it('renders View Profile and Follow buttons when author is present', () => {
    render(<DailyFeaturedSpotlight isLoading={false} data={makeData()} />)
    expect(screen.getByText('View Profile')).toBeInTheDocument()
    expect(screen.getByText('Follow')).toBeInTheDocument()
  })

  it('renders Subscribe CTA when authorSubscriptionMonthlyUsd is set', () => {
    render(
      <DailyFeaturedSpotlight
        isLoading={false}
        data={makeData({ authorSubscriptionMonthlyUsd: 9 })}
      />
    )
    expect(screen.getByText(/Subscribe · \$9\/mo/)).toBeInTheDocument()
  })
})
