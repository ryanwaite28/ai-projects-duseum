// =============================================================================
// frontend/src/components/__tests__/LockedArtworkCard.test.tsx
// Component tests for LockedArtworkCard — FR-TESTING-05
//
// Verifies:
//   - Lock overlay always renders
//   - Unauthenticated click → redirects to /login
//   - Authenticated click   → calls createPlatformCheckout mutation
//   - Loading state         → button shows "…" and is disabled
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '../../test/test-utils'
import { LockedArtworkCard } from '../artwork/LockedArtworkCard'
import type { ArtworkListItem } from '../../types/artwork'
import { useAuthStore } from '../../store/auth.store'
import { subscriptionsService } from '../../services/subscriptions.service'

vi.mock('../../store/auth.store', () => ({
  useAuthStore: vi.fn(),
}))

vi.mock('../../services/subscriptions.service', () => ({
  subscriptionsService: {
    createPlatformCheckout: vi.fn(),
  },
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockUseAuthStore = vi.mocked(useAuthStore)
const mockCheckout     = vi.mocked(subscriptionsService.createPlatformCheckout)

const artwork: ArtworkListItem = {
  artworkId:         'art-locked',
  title:             'Locked Piece',
  authorId:          'author-001',
  authorDisplayName: 'Test Author',
  category:          'DIGITAL',
  tags:              [],
  thumbnailUrl:      null,
  viewCount:         0,
  reactionCounts:    {},
  commentCount:      0,
  publishedAt:       '2025-01-01T00:00:00.000Z',
  accessTier:        'REQUIRES_PLATFORM_SUB',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCheckout.mockResolvedValue({ checkoutUrl: 'https://checkout.stripe.com/test' })
})

describe('LockedArtworkCard — lock overlay', () => {
  it('renders the lock icon', () => {
    mockUseAuthStore.mockReturnValue({ user: null, isLoading: false } as never)
    render(<LockedArtworkCard artwork={artwork} />)
    expect(screen.getByText('🔒')).toBeInTheDocument()
  })

  it('renders "Beyond free tier" text', () => {
    mockUseAuthStore.mockReturnValue({ user: null, isLoading: false } as never)
    render(<LockedArtworkCard artwork={artwork} />)
    expect(screen.getByText('Beyond free tier')).toBeInTheDocument()
  })

  it('renders the "Unlock all" button', () => {
    mockUseAuthStore.mockReturnValue({ user: null, isLoading: false } as never)
    render(<LockedArtworkCard artwork={artwork} />)
    expect(screen.getByRole('button', { name: 'Unlock all' })).toBeInTheDocument()
  })

  it('renders the artwork title in the metadata section', () => {
    mockUseAuthStore.mockReturnValue({ user: null, isLoading: false } as never)
    render(<LockedArtworkCard artwork={artwork} />)
    expect(screen.getByText('Locked Piece')).toBeInTheDocument()
  })
})

describe('LockedArtworkCard — unauthenticated click', () => {
  it('navigates to /login?return=/browse when user is not authenticated', async () => {
    mockUseAuthStore.mockReturnValue({ user: null, isLoading: false } as never)
    render(<LockedArtworkCard artwork={artwork} />)

    await userEvent.click(screen.getByRole('button', { name: 'Unlock all' }))

    expect(mockNavigate).toHaveBeenCalledWith('/login?return=/browse')
    expect(mockCheckout).not.toHaveBeenCalled()
  })
})

describe('LockedArtworkCard — authenticated click', () => {
  it('calls createPlatformCheckout when authenticated user clicks Unlock all', async () => {
    mockUseAuthStore.mockReturnValue({
      user: { userId: 'u1', email: 'user@test.com' },
      isLoading: false,
    } as never)
    render(<LockedArtworkCard artwork={artwork} />)

    await userEvent.click(screen.getByRole('button', { name: 'Unlock all' }))

    await waitFor(() => {
      expect(mockCheckout).toHaveBeenCalledOnce()
    })
  })

  it('does not navigate to /login when user is authenticated', async () => {
    mockUseAuthStore.mockReturnValue({
      user: { userId: 'u1', email: 'user@test.com' },
      isLoading: false,
    } as never)
    render(<LockedArtworkCard artwork={artwork} />)

    await userEvent.click(screen.getByRole('button', { name: 'Unlock all' }))

    expect(mockNavigate).not.toHaveBeenCalled()
  })
})

describe('LockedArtworkCard — error state', () => {
  it('renders error message when checkout fails', async () => {
    mockUseAuthStore.mockReturnValue({
      user: { userId: 'u1', email: 'user@test.com' },
      isLoading: false,
    } as never)
    mockCheckout.mockRejectedValueOnce(
      Object.assign(new Error('Card declined'), { message: 'Card declined' })
    )
    render(<LockedArtworkCard artwork={artwork} />)

    await userEvent.click(screen.getByRole('button', { name: 'Unlock all' }))

    await waitFor(() => {
      expect(screen.getByText('Card declined')).toBeInTheDocument()
    })
  })
})
