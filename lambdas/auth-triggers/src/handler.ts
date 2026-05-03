// =============================================================================
// lambdas/auth-triggers/src/handler.ts
// Cognito Post-Confirmation Lambda trigger — §4.2, FR-AUTH-02, FR-PROF-01
//
// Fires after a user successfully confirms their email address.
// Creates two DynamoDB records:
//   1. UserAccount   PK=USER#{userId}        SK=PROFILE
//   2. ViewerProfile PK=USER#{userId}        SK=PROFILE#VIEWER
//
// Cognito trigger contract: must return the event object unchanged.
// If the Lambda throws, Cognito surfaces an error to the client.
// =============================================================================

import type { PostConfirmationTriggerHandler } from 'aws-lambda'
import { docClient } from '@duseum/shared'
import { logger } from '@duseum/shared'
import { createUserAccount, createViewerProfile, sendWelcomeEmail } from '@duseum/shared'

// ── Handler ────────────────────────────────────────────────────────────────────

export const handler: PostConfirmationTriggerHandler = async (event) => {
  // Only handle email confirmation — not password-reset confirmation
  if (event.triggerSource !== 'PostConfirmation_ConfirmSignUp') {
    return event
  }

  const userId = event.userName                              // Cognito sub (UUID)
  const email  = event.request.userAttributes['email'] ?? ''
  const now    = new Date().toISOString()

  // Derive initial display name from the email username part.
  // The user can update this later via their profile settings.
  const displayName = email.split('@')[0] ?? userId

  logger.info('Post-confirmation: creating user records', {
    userId,
    triggerSource: event.triggerSource,
  })

  // ── 1. UserAccount ───────────────────────────────────────────────────────────
  await createUserAccount(docClient, {
    userId,
    email,           // NOTE: email is PII — logged only in the DynamoDB record, never in logs
    systemRole: 'USER',
    emailVerified: true,
    createdAt: now,
    lastLoginAt: now,
  })

  // ── 2. ViewerProfile ─────────────────────────────────────────────────────────
  await createViewerProfile(docClient, {
    userId,
    profileType: 'VIEWER',
    status: 'ACTIVE',
    displayName,
    createdAt: now,
    notificationGlobalOptOut: false,
    defaultNotificationPref: 'ALL_NEW_PIECES',
  })

  logger.info('Post-confirmation: user records created', { userId })

  const baseUrl = process.env['APP_BASE_URL'] ?? 'https://duseum.com'
  void sendWelcomeEmail(email, {
    displayName,
    browseUrl: `${baseUrl}/browse`,
  }).catch((err) => logger.error('Failed to send welcome email', { userId, err }))

  // Cognito trigger contract — always return the event unchanged
  return event
}
