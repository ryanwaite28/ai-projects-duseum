// =============================================================================
// lambdas/users/src/routes/get-me.ts
// GET /users/me — return UserAccount + ViewerProfile + AuthorProfile (§8.4)
// =============================================================================

import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import {
  UnauthorizedError,
  docClient,
  getAuthorProfile,
  getUserAccount,
  getViewerProfile,
  ok,
} from '@duseum/shared'
import type { DuseumContext } from '@duseum/shared'

export const getMe = async (
  context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2> => {
  const { userId } = context
  if (!userId) throw new UnauthorizedError()

  const [account, viewerProfile, authorProfile] = await Promise.all([
    getUserAccount(docClient, userId),
    getViewerProfile(docClient, userId),
    getAuthorProfile(docClient, userId),
  ])

  return ok({ account, viewerProfile, authorProfile })
}
