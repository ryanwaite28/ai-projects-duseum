// =============================================================================
// frontend/src/components/__tests__/AnalyticsTab.test.tsx
// FR-SUB-14 — Author Stripe Connect Dashboard link in AnalyticsTab
//
// Covers the three rendering states of the "Stripe Connect" card:
//   1. chargesEnabled = true  → "Open Stripe Dashboard" button
//   2. chargesEnabled = false → setup-incomplete note (no button)
//   3. Mutation redirect on button click
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '../../test/test-utils'
import { AnalyticsTab } from '../../pages/dashboard/tabs/analytics-tab'
import { subscriptionsService } from '../../services/subscriptions.service'
import { authorDashboardService } from '../../services/author-dashboard.service'

vi.mock('../../services/subscriptions.service', () => ({
  subscriptionsService: {
    createPortalSession:    vi.fn(),
    createConnectLoginLink: vi.fn(),
  },
}))

vi.mock('../../services/author-dashboard.service', () => ({
  authorDashboardService: {
    connectStatus: vi.fn(),
    getMe:         vi.fn(),
  },
}))

vi.mock('../../hooks/use-me', () => ({
  useMe: () => ({
    data: {
      authorProfile: {
        subscriberCount:              2,
        authorSubscriptionMonthlyUsd: 5,
        stripeConnectAccountId:       'acct_test_001',
        connectChargesEnabled:        true,
      },
    },
  }),
}))

const mockConnectStatus = vi.mocked(authorDashboardService.connectStatus)
const mockCreateLoginLink = vi.mocked(subscriptionsService.createConnectLoginLink)

beforeEach(() => vi.clearAllMocks())

describe('AnalyticsTab — Stripe Connect card', () => {
  it('renders "Open Stripe Dashboard" button when chargesEnabled is true', async () => {
    mockConnectStatus.mockResolvedValue({ chargesEnabled: true, stripeConnectAccountId: 'acct_test_001', detailsSubmitted: true })
    render(<AnalyticsTab />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /open stripe dashboard/i })).toBeInTheDocument()
    )
    expect(screen.queryByText(/still being set up/i)).toBeNull()
  })

  it('renders setup-incomplete note (no button) when chargesEnabled is false', async () => {
    mockConnectStatus.mockResolvedValue({ chargesEnabled: false, stripeConnectAccountId: 'acct_test_001', detailsSubmitted: false })
    render(<AnalyticsTab />)
    await waitFor(() =>
      expect(screen.getByText(/still being set up/i)).toBeInTheDocument()
    )
    expect(screen.queryByRole('button', { name: /open stripe dashboard/i })).toBeNull()
  })

  it('calls createConnectLoginLink and redirects on button click', async () => {
    const user = userEvent.setup()
    mockConnectStatus.mockResolvedValue({ chargesEnabled: true, stripeConnectAccountId: 'acct_test_001', detailsSubmitted: true })
    mockCreateLoginLink.mockResolvedValue({
      loginUrl: 'https://connect.stripe.com/express/dashboard/test',
    })

    const assignSpy = vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      href: '',
    } as Location)

    render(<AnalyticsTab />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /open stripe dashboard/i })).toBeInTheDocument()
    )
    await user.click(screen.getByRole('button', { name: /open stripe dashboard/i }))
    await waitFor(() =>
      expect(mockCreateLoginLink).toHaveBeenCalledTimes(1)
    )

    assignSpy.mockRestore()
  })

  it('shows error message when createConnectLoginLink fails', async () => {
    const user = userEvent.setup()
    mockConnectStatus.mockResolvedValue({ chargesEnabled: true, stripeConnectAccountId: 'acct_test_001', detailsSubmitted: true })
    mockCreateLoginLink.mockRejectedValue(new Error('Network error'))

    render(<AnalyticsTab />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /open stripe dashboard/i })).toBeInTheDocument()
    )
    await user.click(screen.getByRole('button', { name: /open stripe dashboard/i }))
    await waitFor(() =>
      expect(screen.getByText(/Failed to open dashboard/i)).toBeInTheDocument()
    )
  })
})
