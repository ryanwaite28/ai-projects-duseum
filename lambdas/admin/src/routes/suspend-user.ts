// PUT /admin/users/{userId}/suspend — suspend a user account (all profiles).
// FR-ADMIN-02, FR-AUTH-07: Account suspension disables all profiles simultaneously.
//
// Flow: Parallel Cognito AdminDisableUser + DynamoDB profile fetches →
// update ViewerProfile + AuthorProfile (if exists and not DEACTIVATED) to SUSPENDED.

import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb'
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  NotFoundError,
  docClient,
  getAuthorProfile,
  getViewerProfile,
  ok,
  updateProfileStatus,
} from '@duseum/shared'
import { cognitoAdminDisableUser } from '../cognito.js'

export const suspendUser = async (
  _event: APIGatewayProxyEventV2,
  _context: DuseumContext,
  userId: string
): Promise<APIGatewayProxyStructuredResultV2> => {
  const [viewerProfile, authorProfile] = await Promise.all([
    getViewerProfile(docClient, userId),
    getAuthorProfile(docClient, userId),
  ])

  if (!viewerProfile) throw new NotFoundError('User not found')

  const now = new Date().toISOString()

  await Promise.all([
    cognitoAdminDisableUser(userId),
    updateProfileStatus(docClient, userId, 'VIEWER', 'SUSPENDED', now),
    ...(authorProfile && authorProfile.status !== 'DEACTIVATED'
      ? [updateProfileStatus(docClient, userId, 'AUTHOR', 'SUSPENDED', now).catch((err) => {
          if (err instanceof ConditionalCheckFailedException) return
          throw err
        })]
      : []),
  ])

  return ok({ userId, suspended: true, suspendedAt: now })
}
