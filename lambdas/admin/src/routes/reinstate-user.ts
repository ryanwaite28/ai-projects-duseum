// PUT /admin/users/{userId}/reinstate — reinstate a suspended user account.
// FR-ADMIN-02: Admins can reinstate user accounts and individual profiles.
//
// Flow: Parallel Cognito AdminEnableUser + DynamoDB profile fetches →
// set SUSPENDED profiles back to ACTIVE (DEACTIVATED profiles are unchanged).

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
import { cognitoAdminEnableUser } from '../cognito.js'

export const reinstateUser = async (
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
    cognitoAdminEnableUser(userId),
    ...(viewerProfile.status === 'SUSPENDED'
      ? [updateProfileStatus(docClient, userId, 'VIEWER', 'ACTIVE', now)]
      : []),
    ...(authorProfile?.status === 'SUSPENDED'
      ? [updateProfileStatus(docClient, userId, 'AUTHOR', 'ACTIVE', now)]
      : []),
  ])

  return ok({ userId, reinstated: true, reinstatedAt: now })
}
