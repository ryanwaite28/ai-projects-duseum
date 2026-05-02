import { fetchAuthSession } from 'aws-amplify/auth'
import { getAccessToken } from '../store/auth.store'

const API_BASE = import.meta.env.VITE_API_BASE_URL as string

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const getToken = async (forceRefresh = false): Promise<string | null> => {
  // Local auth stub returns the fabricated JWT; real Cognito uses Amplify.
  if (import.meta.env.VITE_AUTH_STUB === 'true') {
    return getAccessToken()
  }
  try {
    const session = await fetchAuthSession({ forceRefresh })
    return session.tokens?.accessToken?.toString() ?? null
  } catch {
    return null
  }
}

const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const token = await getToken()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers })

  if (res.status === 401) {
    // One silent refresh attempt
    const refreshedToken = await getToken(true)
    if (refreshedToken) {
      headers['Authorization'] = `Bearer ${refreshedToken}`
      const retry = await fetch(`${API_BASE}${path}`, { ...init, headers })
      if (!retry.ok) {
        const body = await retry.json().catch(() => ({ message: retry.statusText }))
        throw new ApiError(retry.status, body.message ?? retry.statusText)
      }
      return retry.json() as Promise<T>
    }
    // Refresh failed — session is gone; redirect to login
    window.location.href = '/login'
    throw new ApiError(401, 'Session expired')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }))
    throw new ApiError(res.status, body.message ?? res.statusText)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  get:            <T>(path: string)                    => request<T>(path, { method: 'GET' }),
  post:           <T>(path: string, body: unknown)     => request<T>(path, { method: 'POST',   body: JSON.stringify(body) }),
  put:            <T>(path: string, body: unknown)     => request<T>(path, { method: 'PUT',    body: JSON.stringify(body) }),
  patch:          <T>(path: string, body: unknown)     => request<T>(path, { method: 'PATCH',  body: JSON.stringify(body) }),
  delete:         <T>(path: string)                    => request<T>(path, { method: 'DELETE' }),
  deleteWithBody: <T>(path: string, body: unknown)     => request<T>(path, { method: 'DELETE', body: JSON.stringify(body) }),
}
