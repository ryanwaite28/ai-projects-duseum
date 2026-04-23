// =============================================================================
// packages/shared/src/notifications/index.ts
// Notification preference resolver — FR-NOTIF-07
//
// Determines the effective notification preference for a viewer+author pair,
// applying global opt-out and per-author override in the correct precedence.
// =============================================================================

import type { ViewerProfile, NotificationPref } from '../types/index.js'

/**
 * Resolves the effective notification preference for a given viewer/author pair.
 *
 * Precedence (highest to lowest):
 *   1. Global opt-out (notificationGlobalOptOut === true) → always NONE
 *   2. Per-author override (if a NotificationPreference record exists) → use that value
 *   3. Viewer's defaultNotificationPref → fallback
 *
 * @param viewer           - The viewer's profile (contains global opt-out flag + default pref)
 * @param perAuthorOverride - The pref field from the viewer's NotificationPreference record for
 *                            this specific author, or undefined if no override record exists
 */
export const resolveNotificationPref = (
  viewer: ViewerProfile,
  perAuthorOverride?: NotificationPref
): NotificationPref => {
  // Global opt-out suppresses all delivery regardless of any other setting
  if (viewer.notificationGlobalOptOut) return 'NONE'

  // Per-author override takes precedence over the viewer's default
  if (perAuthorOverride !== undefined) return perAuthorOverride

  // Fall back to the viewer's account-level default
  return viewer.defaultNotificationPref
}
