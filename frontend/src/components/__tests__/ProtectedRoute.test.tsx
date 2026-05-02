// =============================================================================
// frontend/src/components/__tests__/ProtectedRoute.test.tsx
// Component tests for ProtectedRoute — FR-TESTING-05
//
// Verifies the three states:
//   1. isLoading=true   → spinner shown, children not rendered
//   2. user=null        → redirects to /login?return={pathname}
//   3. user present     → children rendered
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from '../layout/ProtectedRoute'
import { useAuthStore } from '../../store/auth.store'

vi.mock('../../store/auth.store', () => ({
  useAuthStore: vi.fn(),
}))

const mockUseAuthStore = vi.mocked(useAuthStore)

// Custom render with routes so Navigate has a target to resolve against
const renderWithRoutes = (initialPath = '/dashboard') =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <div>Protected Content</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login"  element={<div>Login Page</div>} />
        <Route path="/403"    element={<div>Forbidden</div>} />
      </Routes>
    </MemoryRouter>
  )

beforeEach(() => vi.clearAllMocks())

describe('ProtectedRoute — loading state', () => {
  it('shows a loading spinner while isLoading is true', () => {
    mockUseAuthStore.mockReturnValue({ user: null, isLoading: true } as never)
    const { container } = renderWithRoutes()
    // The spinner is a div with animate-float class — children not rendered
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument()
    expect(container.querySelector('.animate-float')).toBeInTheDocument()
  })
})

describe('ProtectedRoute — unauthenticated', () => {
  it('redirects to /login when user is null', () => {
    mockUseAuthStore.mockReturnValue({ user: null, isLoading: false } as never)
    renderWithRoutes('/dashboard')
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    expect(screen.getByText('Login Page')).toBeInTheDocument()
  })

  it('does not render children when unauthenticated', () => {
    mockUseAuthStore.mockReturnValue({ user: null, isLoading: false } as never)
    renderWithRoutes()
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })
})

describe('ProtectedRoute — authenticated', () => {
  it('renders children when user is present', () => {
    mockUseAuthStore.mockReturnValue({
      user: { userId: 'u1', email: 'user@test.com' },
      isLoading: false,
    } as never)
    renderWithRoutes()
    expect(screen.getByText('Protected Content')).toBeInTheDocument()
  })

  it('does not redirect to /login when user is present', () => {
    mockUseAuthStore.mockReturnValue({
      user: { userId: 'u1', email: 'user@test.com' },
      isLoading: false,
    } as never)
    renderWithRoutes()
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument()
  })
})
