// PUT /admin/users/{userId}/profiles/{profileType}/suspend — suspend a single profile.
// FR-ADMIN-02, FR-PROF-05: Individual profiles can be suspended independently.
// profileType: 'VIEWER' | 'AUTHOR'

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  docClient,
  getAuthorProfile,
  getViewerProfile,
  ok,
  updateProfileStatus,
} from '@duseum/shared'

const VALID_PROFILE_TYPES = new Set(['VIEWER', 'AUTHOR'])

export const suspendProfile = async (
  _event: APIGatewayProxyEventV2,
  _context: DuseumContext,
  userId: string,
  profileType: string
): Promise<APIGatewayProxyStructuredResultV2> => {
  if (!VALID_PROFILE_TYPES.has(profileType)) {
    throw new ValidationError('profileType must be VIEWER or AUTHOR')
  }

  const profile =
    profileType === 'VIEWER'
      ? await getViewerProfile(docClient, userId)
      : await getAuthorProfile(docClient, userId)

  if (!profile) throw new NotFoundError(`${profileType} profile not found`)
  if (profile.status === 'SUSPENDED') {
    throw new ConflictError(`${profileType} profile is already suspended`)
  }

  const now = new Date().toISOString()
  await updateProfileStatus(docClient, userId, profileType as 'VIEWER' | 'AUTHOR', 'SUSPENDED', now)

  return ok({ userId, profileType, status: 'SUSPENDED', suspendedAt: now })
}
