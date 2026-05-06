import { api } from './api'

export interface Subscription {
  userId:               string
  targetId:             string   // 'PLATFORM' or authorId
  stripeSubscriptionId: string
  stripeCustomerId:     string
  status:               'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'INCOMPLETE'
  currentPeriodEnd:     string | null
  createdAt:            string
}

export interface MySubscriptionsResponse {
  platform:            Subscription | null
  authorSubscriptions: Subscription[]
}

export interface SubscriberItem {
  userId:               string
  stripeSubscriptionId: string
  status:               'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'INCOMPLETE' | 'PAUSED'
  currentPeriodEnd:     string | null
  createdAt:            string
}

export interface MySubscribersResponse {
  items:      SubscriberItem[]
  nextCursor: string | null
  total:      number
}

export interface CheckoutResponse {
  checkoutUrl: string
}

export interface PortalResponse {
  portalUrl: string
}

export interface ConnectLoginLinkResponse {
  loginUrl: string
}

export const subscriptionsService = {
  getMySubscriptions: () =>
    api.get<MySubscriptionsResponse>('/subscriptions/me'),

  createPlatformCheckout: () =>
    api.post<CheckoutResponse>('/subscriptions/platform', {}),

  createAuthorCheckout: (authorId: string) =>
    api.post<CheckoutResponse>(`/subscriptions/authors/${authorId}`, {}),

  createPortalSession: () =>
    api.post<PortalResponse>('/subscriptions/portal', {}),

  createConnectLoginLink: () =>
    api.post<ConnectLoginLinkResponse>('/subscriptions/connect/login-link', {}),

  getMySubscribers: (cursor?: string) => {
    const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
    return api.get<MySubscribersResponse>(`/subscriptions/me/subscribers${qs}`)
  },
}
