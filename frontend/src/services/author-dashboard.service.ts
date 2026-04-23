import { api } from './api'

export interface ConnectOnboardResponse {
  accountLinkUrl: string
}

export interface ConnectStatusResponse {
  stripeConnectAccountId: string
  chargesEnabled: boolean
  detailsSubmitted: boolean
}

export interface SetSubscriptionPriceResponse {
  priceId: string | null
  monthlyUsd: number | null
}

export const authorDashboardService = {
  connectOnboard: () =>
    api.post<ConnectOnboardResponse>('/subscriptions/connect/onboard', {}),

  connectStatus: () =>
    api.get<ConnectStatusResponse>('/subscriptions/connect/status'),

  setSubscriptionPrice: (amountUsd: number) =>
    api.post<SetSubscriptionPriceResponse>('/users/me/author/subscription-price', { amountUsd }),
}
