// =============================================================================
// frontend/src/store/__tests__/auth.store.test.ts
// FR-TESTING-06 — Regression: clears React Query cache on sign-out so stale
// data is not served to the next user who signs in on the same browser session.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted ensures mockClear exists before vi.mock factories run
const { mockClear } = vi.hoisted(() => ({ mockClear: vi.fn() }))

vi.mock('../../lib/query-client', () => ({
  queryClient: { clear: mockClear },
}))

vi.mock('aws-amplify/auth', () => ({
  signIn:               vi.fn(),
  signOut:              vi.fn().mockResolvedValue(undefined),
  signUp:               vi.fn(),
  confirmSignUp:        vi.fn(),
  fetchAuthSession:     vi.fn(),
  getCurrentUser:       vi.fn(),
  resetPassword:        vi.fn(),
  confirmResetPassword: vi.fn(),
}))

import { useAuthStore } from '../auth.store'

// localStorage is used by the local-auth stub path (VITE_AUTH_STUB=true in .env.local)
const localStorageMock = {
  getItem:    vi.fn().mockReturnValue(null),
  setItem:    vi.fn(),
  removeItem: vi.fn(),
  clear:      vi.fn(),
}
vi.stubGlobal('localStorage', localStorageMock)

describe('useAuthStore.signOut', () => {
  beforeEach(() => {
    mockClear.mockClear()
    vi.clearAllMocks()
    useAuthStore.setState({ user: { userId: 'u1', email: 'a@b.com' }, isLoading: false, error: null })
  })

  it('clears React Query cache on sign-out so stale data is not served to the next user', async () => {
    await useAuthStore.getState().signOut()
    expect(mockClear).toHaveBeenCalledOnce()
  })

  it('nulls the user after clearing the cache', async () => {
    await useAuthStore.getState().signOut()
    expect(mockClear).toHaveBeenCalledOnce()
    expect(useAuthStore.getState().user).toBeNull()
  })
})
