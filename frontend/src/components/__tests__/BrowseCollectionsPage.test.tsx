// =============================================================================
// frontend/src/components/__tests__/BrowseCollectionsPage.test.tsx
// FR-TESTING-06 regression — browse-collections.tsx error state
//
// Root cause: BrowseCollectionsPage had no isError branch. When GET /collections
// returned a non-2xx response React Query set isError=true, but the component
// only checked isLoading — so the error state silently fell through to the
// "No collections published yet" empty state, masking backend failures.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '../../test/test-utils'
import BrowseCollectionsPage from '../../pages/browse-collections'
import { collectionsService } from '../../services/collections.service'

vi.mock('../../services/collections.service', () => ({
  collectionsService: {
    browse: vi.fn(),
  },
}))

vi.mock('../../hooks/use-reveal', () => ({
  useReveal: () => ({ current: null }),
}))

const mockBrowse = vi.mocked(collectionsService.browse)

const makeCollection = (id: string) => ({
  collectionId:      id,
  title:             `Collection ${id}`,
  description:       null,
  visibility:        'FREE' as const,
  posterUrl:         null,
  authorId:          'author-001',
  authorDisplayName: 'Test Artist',
  pieceCount:        3,
  createdAt:         '2026-05-01T00:00:00.000Z',
})

beforeEach(() => vi.clearAllMocks())

describe('BrowseCollectionsPage', () => {
  it('renders loading skeleton while fetching', () => {
    mockBrowse.mockReturnValue(new Promise(() => {})) // never resolves
    const { container } = render(<BrowseCollectionsPage />)
    expect(container.querySelector('.animate-pulse')).toBeTruthy()
    expect(screen.queryByText(/No collections/)).toBeNull()
  })

  it('renders error state when API call fails — regression: not empty-state fallthrough', async () => {
    mockBrowse.mockRejectedValue(new Error('Network error'))
    render(<BrowseCollectionsPage />)
    await waitFor(() =>
      expect(screen.getByText(/Something went wrong/)).toBeInTheDocument()
    )
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    expect(screen.queryByText(/No collections published yet/)).toBeNull()
  })

  it('calls refetch when "Try again" button is clicked', async () => {
    const user = userEvent.setup()
    mockBrowse.mockRejectedValue(new Error('Network error'))
    render(<BrowseCollectionsPage />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    )
    mockBrowse.mockResolvedValueOnce({ items: [], cursor: undefined })
    await user.click(screen.getByRole('button', { name: /try again/i }))
    // refetch triggers a new call
    expect(mockBrowse).toHaveBeenCalledTimes(2)
  })

  it('renders empty state when data returns 0 items', async () => {
    mockBrowse.mockResolvedValue({ items: [], cursor: undefined })
    render(<BrowseCollectionsPage />)
    await waitFor(() =>
      expect(screen.getByText(/No collections published yet/)).toBeInTheDocument()
    )
    expect(screen.queryByText(/Something went wrong/)).toBeNull()
  })

  it('renders collection cards when data is present', async () => {
    mockBrowse.mockResolvedValue({
      items:  [makeCollection('col-001'), makeCollection('col-002')],
      cursor: undefined,
    })
    render(<BrowseCollectionsPage />)
    await waitFor(() =>
      expect(screen.getByText('Collection col-001')).toBeInTheDocument()
    )
    expect(screen.getByText('Collection col-002')).toBeInTheDocument()
    expect(screen.queryByText(/No collections published yet/)).toBeNull()
    expect(screen.queryByText(/Something went wrong/)).toBeNull()
  })
})
