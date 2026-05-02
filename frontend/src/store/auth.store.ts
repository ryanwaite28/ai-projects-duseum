import { create } from 'zustand'
import {
  signIn as amplifySignIn,
  signOut as amplifySignOut,
  signUp as amplifySignUp,
  confirmSignUp,
  fetchAuthSession,
  getCurrentUser,
  resetPassword,
  confirmResetPassword,
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
  initialize:              () => Promise<void>
  signIn:                  (email: string, password: string) => Promise<void>
  signOut:                 () => Promise<void>
  signUp:                  (email: string, password: string) => Promise<void>
  confirmEmail:            (email: string, code: string) => Promise<void>
  forgotPassword:          (email: string) => Promise<void>
  confirmForgotPassword:   (email: string, code: string, newPassword: string) => Promise<void>
  clearError:              () => void
}

// =============================================================================
// Local dev auth stub — active when VITE_AUTH_STUB=true (frontend/.env.local)
//
// Bypasses Cognito entirely. Stores a simple user registry + session in
// localStorage. The Lambda auth middleware in ENVIRONMENT=local accepts any
// JWT by decoding the payload without signature verification, so we fabricate
// a minimal JWT with the user's UUID as `sub`.
// =============================================================================

const IS_LOCAL_AUTH = import.meta.env.VITE_AUTH_STUB === 'true'

const LOCAL_USERS_KEY   = 'duseum_local_users'
const LOCAL_SESSION_KEY = 'duseum_local_session'

interface LocalUser    { userId: string; email: string; password: string }
interface LocalSession { userId: string; email: string; jwt: string }

const toBase64Url = (obj: unknown): string =>
  btoa(JSON.stringify(obj))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')

const makeLocalJwt = (userId: string, email: string): string => {
  const header  = toBase64Url({ alg: 'none', typ: 'JWT' })
  const payload = toBase64Url({
    sub: userId,
    email,
    'cognito:groups': [],
    exp: Math.floor(Date.now() / 1000) + 86400 * 7,
  })
  return `${header}.${payload}.local-stub`
}

const localUsers = {
  all: (): LocalUser[] => {
    try { return JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) ?? '[]') } catch { return [] }
  },
  find: (email: string): LocalUser | null =>
    localUsers.all().find(u => u.email === email) ?? null,
  save: (user: LocalUser): void => {
    const list = localUsers.all().filter(u => u.email !== user.email)
    list.push(user)
    localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(list))
  },
}

const localSession = {
  get:   (): LocalSession | null => {
    try { return JSON.parse(localStorage.getItem(LOCAL_SESSION_KEY) ?? 'null') } catch { return null }
  },
  set:   (s: LocalSession): void => localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(s)),
  clear: (): void => localStorage.removeItem(LOCAL_SESSION_KEY),
}

// =============================================================================

export const useAuthStore = create<AuthState>((set) => ({
  user:      null,
  isLoading: true,
  error:     null,

  initialize: async () => {
    if (IS_LOCAL_AUTH) {
      const s = localSession.get()
      set({ user: s ? { userId: s.userId, email: s.email, displayName: s.email } : null, isLoading: false })
      return
    }
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
    if (IS_LOCAL_AUTH) {
      const stored = localUsers.find(email)
      if (!stored || stored.password !== password) {
        const msg = 'Invalid email or password'
        set({ error: msg, isLoading: false })
        throw new Error(msg)
      }
      const jwt = makeLocalJwt(stored.userId, stored.email)
      localSession.set({ userId: stored.userId, email: stored.email, jwt })
      set({ user: { userId: stored.userId, email: stored.email, displayName: stored.email }, isLoading: false })
      return
    }
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
    if (IS_LOCAL_AUTH) {
      localSession.clear()
      set({ user: null, isLoading: false, error: null })
      return
    }
    try {
      await amplifySignOut()
    } finally {
      set({ user: null, isLoading: false, error: null })
    }
  },

  signUp: async (email, password) => {
    set({ isLoading: true, error: null })
    if (IS_LOCAL_AUTH) {
      if (localUsers.find(email)) {
        const msg = 'An account with this email already exists'
        set({ error: msg, isLoading: false })
        throw new Error(msg)
      }
      const userId = crypto.randomUUID()
      localUsers.save({ userId, email, password })
      set({ isLoading: false })
      return
    }
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

  confirmEmail: async (email, _code) => {
    set({ isLoading: true, error: null })
    if (IS_LOCAL_AUTH) {
      const stored = localUsers.find(email)
      if (!stored) {
        const msg = 'No account found for this email. Please register first.'
        set({ error: msg, isLoading: false })
        throw new Error(msg)
      }
      // Stub: accept any code — account is "verified" immediately
      set({ isLoading: false })
      return
    }
    try {
      await confirmSignUp({ username: email, confirmationCode: _code })
      set({ isLoading: false })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Confirmation failed'
      set({ error: msg, isLoading: false })
      throw err
    }
  },

  forgotPassword: async (email) => {
    set({ isLoading: true, error: null })
    if (IS_LOCAL_AUTH) {
      const stored = localUsers.find(email)
      if (!stored) {
        const msg = 'No account found for this email.'
        set({ error: msg, isLoading: false })
        throw new Error(msg)
      }
      set({ isLoading: false })
      return
    }
    try {
      await resetPassword({ username: email })
      set({ isLoading: false })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Password reset failed'
      set({ error: msg, isLoading: false })
      throw err
    }
  },

  confirmForgotPassword: async (email, code, newPassword) => {
    set({ isLoading: true, error: null })
    if (IS_LOCAL_AUTH) {
      const stored = localUsers.find(email)
      if (!stored) {
        const msg = 'No account found for this email.'
        set({ error: msg, isLoading: false })
        throw new Error(msg)
      }
      // Stub: accept any code, update password
      localUsers.save({ ...stored, password: newPassword })
      set({ isLoading: false })
      return
    }
    try {
      await confirmResetPassword({ username: email, confirmationCode: code, newPassword })
      set({ isLoading: false })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Password reset confirmation failed'
      set({ error: msg, isLoading: false })
      throw err
    }
  },

  clearError: () => set({ error: null }),
}))

// Fetch a fresh access token for API calls — stub-aware
export const getAccessToken = async (): Promise<string | null> => {
  if (IS_LOCAL_AUTH) {
    return localSession.get()?.jwt ?? null
  }
  try {
    const session = await fetchAuthSession()
    return session.tokens?.accessToken?.toString() ?? null
  } catch {
    return null
  }
}
