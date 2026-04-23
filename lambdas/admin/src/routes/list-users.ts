// GET /admin/users — list users with optional email/status filters and Cognito pagination.
// FR-ADMIN-01: Admins can view all users.
//
// Flow: Cognito ListUsers (email prefix filter) → per-user DynamoDB GetItem batch
// → in-app status filter. Cognito pagination token passed through as cursor.

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  docClient,
  getUserAccount,
  getViewerProfile,
  ok,
} from '@duseum/shared'
import { cognitoListUsers } from '../cognito.js'

export const listUsers = async (
  event: APIGatewayProxyEventV2,
  _context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2> => {
  const qs           = event.queryStringParameters ?? {}
  const emailFilter  = qs['email']
  const statusFilter = qs['status']
  const limit        = Math.min(parseInt(qs['limit'] ?? '20', 10), 60)
  const cursor       = qs['cursor']

  const { users: cognitoUsers, nextToken } = await cognitoListUsers(emailFilter, cursor, limit)

  const enriched = await Promise.all(
    cognitoUsers.map(async (cu) => {
      const [account, viewerProfile] = await Promise.all([
        getUserAccount(docClient, cu.userId),
        getViewerProfile(docClient, cu.userId),
      ])
      return {
        userId:              cu.userId,
        email:               cu.email,
        enabled:             cu.enabled,
        userStatus:          cu.userStatus,
        cognitoCreatedAt:    cu.createdAt,
        accountCreatedAt:    account?.createdAt    ?? null,
        systemRole:          account?.systemRole   ?? 'USER',
        viewerProfileStatus: viewerProfile?.status ?? null,
      }
    })
  )

  const users = statusFilter
    ? enriched.filter((u) => u.viewerProfileStatus === statusFilter)
    : enriched

  return ok({ users, nextCursor: nextToken })
}
