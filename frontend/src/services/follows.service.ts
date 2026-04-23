import { api } from './api'

export type NotificationPref = 'ALL_NEW_PIECES' | 'PUBLIC_ONLY' | 'NONE'

export interface FollowResponse {
  authorId:         string
  followedAt:       string
  notificationPref: NotificationPref
}

export interface UnfollowResponse {
  authorId:    string
  unfollowedAt: string
}

export interface PerAuthorOverride {
  authorId:    string
  displayName?: string
  pref:        NotificationPref
  updatedAt:   string
}

export interface NotificationPreferences {
  globalOptOut:       boolean
  defaultPref:        NotificationPref
  perAuthorOverrides: PerAuthorOverride[]
}

export interface UnsubscribeResponse {
  message:            string
  authorId:           string
  authorDisplayName:  string
}

export const followsService = {
  follow: (authorId: string) =>
    api.post<FollowResponse>(`/follows/authors/${authorId}`, {}),

  unfollow: (authorId: string) =>
    api.delete<UnfollowResponse>(`/follows/authors/${authorId}`),

  getNotificationPreferences: () =>
    api.get<NotificationPreferences>('/users/me/notification-preferences'),

  updateNotificationPreferences: (patch: {
    globalOptOut?:       boolean
    defaultPref?:        NotificationPref
    perAuthorOverrides?: Array<{ authorId: string; pref: NotificationPref }>
  }) => api.put<NotificationPreferences>('/users/me/notification-preferences', patch),

  unsubscribeByToken: (token: string) =>
    api.get<UnsubscribeResponse>(`/notifications/unsubscribe?token=${encodeURIComponent(token)}`),
}
