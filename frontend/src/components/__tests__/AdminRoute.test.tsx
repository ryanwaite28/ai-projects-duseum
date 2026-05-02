// =============================================================================
// frontend/src/components/__tests__/AdminRoute.test.tsx
// Component tests for AdminRoute — FR-TESTING-05
//
// Verifies:
//   1. isLoading       → spinner shown
//   2. user=null       → redirect to /login
//   3. user + non-ADMIN → redirect to /403
//   4. user + ADMIN    → children rendered
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AdminRoute } from '../layout/AdminRoute'
import { useAuthStore } from '../../store/auth.store'
import { useMe } from '../../hooks/use-me'

vi.mock('../../store/auth.store', () => ({
  useAuthStore: vi.fn(),
}))

vi.mock('../../hooks/use-me', () => ({
  useMe: vi.fn(),
}))

const mockUseAuthStore = vi.mocked(useAuthStore)
const mockUseMe        = vi.mocked(useMe)

const renderWithRoutes = (initialPath = '/admin') => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <div>Admin Content</div>
              </AdminRoute>
            }
          />
          <Route path="/login"  element={<div>Login Page</div>} />
          <Route path="/403"    element={<div>Forbidden Page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => vi.clearAllMocks())

describe('AdminRoute — loading state', () => {
  it('shows spinner while auth is loading', () => {
    mockUseAuthStore.mockReturnValue({ user: null, isLoading: true } as never)
    mockUseMe.mockReturnValue({ data: undefined, isLoading: false } as never)
    const { container } = renderWithRoutes()
    expect(container.querySelector('.animate-float')).toBeInTheDocument()
    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument()
  })

  it('shows spinner while me query is loading', () => {
    mockUseAuthStore.mockReturnValue({
      user: { userId: 'u1', email: 'admin@test.com' },
      isLoading: false,
    } as never)
    mockUseMe.mockReturnValue({ data: undefined, isLoading: true } as never)
    const { container } = renderWithRoutes()
    expect(container.querySelector('.animate-float')).toBeInTheDocument()
    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument()
  })
})

describe('AdminRoute — unauthenticated', () => {
  it('redirects to /login when user is null', () => {
    mockUseAuthStore.mockReturnValue({ user: null, isLoading: false } as never)
    mockUseMe.mockReturnValue({ data: undefined, isLoading: false } as never)
    renderWithRoutes()
    expect(screen.getByText('Login Page')).toBeInTheDocument()
    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument()
  })
})

describe('AdminRoute — authenticated but not ADMIN', () => {
  it('redirects to /403 when systemRole is USER', () => {
    mockUseAuthStore.mockReturnValue({
      user: { userId: 'u1', email: 'user@test.com' },
      isLoading: false,
    } as never)
    mockUseMe.mockReturnValue({
      data: { account: { userId: 'u1', email: 'user@test.com', systemRole: 'USER' } },
      isLoading: false,
    } as never)
    renderWithRoutes()
    expect(screen.getByText('Forbidden Page')).toBeInTheDocument()
    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument()
  })

  it('does not show admin content for non-ADMIN users', () => {
    mockUseAuthStore.mockReturnValue({
      user: { userId: 'u1', email: 'user@test.com' },
      isLoading: false,
    } as never)
    mockUseMe.mockReturnValue({
      data: { account: { systemRole: 'USER' } },
      isLoading: false,
    } as never)
    renderWithRoutes()
    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument()
  })
})

describe('AdminRoute — ADMIN user', () => {
  it('renders children for ADMIN users', () => {
    mockUseAuthStore.mockReturnValue({
      user: { userId: 'admin1', email: 'admin@test.com' },
      isLoading: false,
    } as never)
    mockUseMe.mockReturnValue({
      data: { account: { userId: 'admin1', email: 'admin@test.com', systemRole: 'ADMIN' } },
      isLoading: false,
    } as never)
    renderWithRoutes()
    expect(screen.getByText('Admin Content')).toBeInTheDocument()
    expect(screen.queryByText('Forbidden Page')).not.toBeInTheDocument()
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument()
  })
})
