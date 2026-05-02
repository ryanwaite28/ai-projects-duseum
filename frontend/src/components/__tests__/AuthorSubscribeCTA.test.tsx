// =============================================================================
// frontend/src/components/__tests__/AuthorSubscribeCTA.test.tsx
// Component tests for AuthorSubscribeCTA — FR-TESTING-05
//
// Verifies:
//   - Returns null when connectChargesEnabled !== true
//   - "Already subscribed" disabled button when alreadySubscribed=true
//   - Subscribe button shows $priceUsd/mo when not subscribed
//   - Calls createAuthorCheckout mutation on authenticated click
//   - Navigates to /login when unauthenticated
//   - Error message rendered on mutation failure
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '../../test/test-utils'
import { AuthorSubscribeCTA } from '../subscription/AuthorSubscribeCTA'
import { useAuthStore } from '../../store/auth.store'
import { subscriptionsService } from '../../services/subscriptions.service'

vi.mock('../../store/auth.store', () => ({
  useAuthStore: vi.fn(),
}))

vi.mock('../../services/subscriptions.service', () => ({
  subscriptionsService: {
    createAuthorCheckout: vi.fn(),
  },
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockUseAuthStore = vi.mocked(useAuthStore)
const mockCheckout     = vi.mocked(subscriptionsService.createAuthorCheckout)

const defaultProps = {
  authorId:              'author-001',
  authorDisplayName:     'Jane Doe',
  priceUsd:              9.99,
  connectChargesEnabled: true as boolean | null,
  alreadySubscribed:     false,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCheckout.mockResolvedValue({ checkoutUrl: 'https://checkout.stripe.com/author-test' })
  mockUseAuthStore.mockReturnValue({ user: null, isLoading: false } as never)
})

describe('AuthorSubscribeCTA — connectChargesEnabled guard', () => {
  it('renders nothing when connectChargesEnabled is false', () => {
    const { container } = render(
      <AuthorSubscribeCTA {...defaultProps} connectChargesEnabled={false} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when connectChargesEnabled is null', () => {
    const { container } = render(
      <AuthorSubscribeCTA {...defaultProps} connectChargesEnabled={null} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders subscribe button when connectChargesEnabled is true', () => {
    render(<AuthorSubscribeCTA {...defaultProps} />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })
})

describe('AuthorSubscribeCTA — already subscribed', () => {
  it('renders a disabled "Already subscribed" button', () => {
    render(<AuthorSubscribeCTA {...defaultProps} alreadySubscribed />)
    const btn = screen.getByRole('button', { name: /already subscribed/i })
    expect(btn).toBeInTheDocument()
    expect(btn).toBeDisabled()
  })

  it('does not render the "Unlock … private gallery" caption when already subscribed', () => {
    render(<AuthorSubscribeCTA {...defaultProps} alreadySubscribed />)
    expect(screen.queryByText(/private gallery/i)).not.toBeInTheDocument()
  })
})

describe('AuthorSubscribeCTA — not subscribed', () => {
  it('renders button with price when not subscribed', () => {
    render(<AuthorSubscribeCTA {...defaultProps} priceUsd={9.99} />)
    expect(screen.getByRole('button', { name: /subscribe.*\$9\.99\/mo/i })).toBeInTheDocument()
  })

  it('renders the "Unlock … private gallery" caption', () => {
    render(<AuthorSubscribeCTA {...defaultProps} />)
    expect(screen.getByText(/private gallery/i)).toBeInTheDocument()
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument()
  })
})

describe('AuthorSubscribeCTA — unauthenticated click', () => {
  it('navigates to /login?return=/authors/{authorId} when user is null', async () => {
    mockUseAuthStore.mockReturnValue({ user: null } as never)
    render(<AuthorSubscribeCTA {...defaultProps} />)

    await userEvent.click(screen.getByRole('button', { name: /subscribe/i }))

    expect(mockNavigate).toHaveBeenCalledWith('/login?return=/authors/author-001')
    expect(mockCheckout).not.toHaveBeenCalled()
  })
})

describe('AuthorSubscribeCTA — authenticated click', () => {
  it('calls createAuthorCheckout with authorId when user is authenticated', async () => {
    mockUseAuthStore.mockReturnValue({
      user: { userId: 'u1', email: 'user@test.com' },
    } as never)
    render(<AuthorSubscribeCTA {...defaultProps} />)

    await userEvent.click(screen.getByRole('button', { name: /subscribe/i }))

    await waitFor(() => {
      expect(mockCheckout).toHaveBeenCalledWith('author-001')
    })
  })
})

describe('AuthorSubscribeCTA — error state', () => {
  it('renders error message when mutation fails', async () => {
    mockUseAuthStore.mockReturnValue({
      user: { userId: 'u1', email: 'user@test.com' },
    } as never)
    mockCheckout.mockRejectedValueOnce(
      Object.assign(new Error('Author not found'), { message: 'Author not found' })
    )
    render(<AuthorSubscribeCTA {...defaultProps} />)

    await userEvent.click(screen.getByRole('button', { name: /subscribe/i }))

    await waitFor(() => {
      expect(screen.getByText('Author not found')).toBeInTheDocument()
    })
  })
})
