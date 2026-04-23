import { create } from 'zustand'
import {
  signIn as amplifySignIn,
  signOut as amplifySignOut,
  signUp as amplifySignUp,
  confirmSignUp,
  fetchAuthSession,
  getCurrentUser,
} from 'aws-amplify/auth'

export interface AuthUser {
  userId: string
  email: string
  displayName?: string
}

interface AuthState {
  user: AuthUser | null
  isLoading: boolean
  error: string | null

  // Actions
  initialize: () => Promise<void>
  signIn:     (email: string, password: string) => Promise<void>
  signOut:    () => Promise<void>
  signUp:     (email: string, password: string) => Promise<void>
  confirmEmail: (email: string, code: string) => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user:      null,
  isLoading: true,
  error:     null,

  initialize: async () => {
    try {
      const cognitoUser = await getCurrentUser()
      set({
        user: {
          userId:      cognitoUser.userId,
          email:       cognitoUser.signInDetails?.loginId ?? '',
          displayName: cognitoUser.signInDetails?.loginId,
        },
        isLoading: false,
      })
    } catch {
      set({ user: null, isLoading: false })
    }
  },

  signIn: async (email, password) => {
    set({ isLoading: true, error: null })
    try {
      await amplifySignIn({ username: email, password })
      const cognitoUser = await getCurrentUser()
      set({
        user: {
          userId:      cognitoUser.userId,
          email:       cognitoUser.signInDetails?.loginId ?? email,
          displayName: cognitoUser.signInDetails?.loginId ?? email,
        },
        isLoading: false,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign in failed'
      set({ error: msg, isLoading: false })
      throw err
    }
  },

  signOut: async () => {
    set({ isLoading: true })
    try {
      await amplifySignOut()
    } finally {
      set({ user: null, isLoading: false, error: null })
    }
  },

  signUp: async (email, password) => {
    set({ isLoading: true, error: null })
    try {
      await amplifySignUp({
        username: email,
        password,
        options: { userAttributes: { email } },
      })
      set({ isLoading: false })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration failed'
      set({ error: msg, isLoading: false })
      throw err
    }
  },

  confirmEmail: async (email, code) => {
    set({ isLoading: true, error: null })
    try {
      await confirmSignUp({ username: email, confirmationCode: code })
      set({ isLoading: false })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Confirmation failed'
      set({ error: msg, isLoading: false })
      throw err
    }
  },

  clearError: () => set({ error: null }),
}))

// Fetch a fresh access token for API calls — always reads from Amplify session
export const getAccessToken = async (): Promise<string | null> => {
  try {
    const session = await fetchAuthSession()
    return session.tokens?.accessToken?.toString() ?? null
  } catch {
    return null
  }
}
