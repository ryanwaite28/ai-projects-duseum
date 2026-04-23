import { api } from './api'

export interface Subscription {
  userId:               string
  targetId:             string   // 'PLATFORM' or authorId
  stripeSubscriptionId: string
  stripeCustomerId:     string
  status:               'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'INCOMPLETE'
  currentPeriodEnd:     string
  createdAt:            string
}

export interface MySubscriptionsResponse {
  platform:            Subscription | null
  authorSubscriptions: Subscription[]
}

export interface CheckoutResponse {
  checkoutUrl: string
}

export interface PortalResponse {
  portalUrl: string
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
}
