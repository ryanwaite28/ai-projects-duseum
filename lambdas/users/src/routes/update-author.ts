// =============================================================================
// lambdas/users/src/routes/update-author.ts
// PUT /users/me/author — update AuthorProfile (§8.4, FR-AUTH-PROF-01)
// =============================================================================

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { z } from 'zod'
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  docClient,
  getAuthorProfile,
  ok,
  updateAuthorProfile,
} from '@duseum/shared'
import type { DuseumContext } from '@duseum/shared'

const schema = z.object({
  displayName:                z.string().min(1).max(100).optional(),
  bio:                        z.string().max(2000).optional(),
  profilePhotoS3Key:          z.string().nullable().optional(),
  coverPhotoS3Key:            z.string().nullable().optional(),
  featuredPieceIds:           z.array(z.string()).max(3).optional(),
  authorSubscriptionMonthlyUsd: z.number().min(1).max(50).nullable().optional(),
}).refine(
  (d) => Object.keys(d).length > 0,
  { message: 'At least one field must be provided' }
)

export const updateAuthor = async (
  event: APIGatewayProxyEventV2,
  context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2> => {
  const { userId } = context
  if (!userId) throw new UnauthorizedError()

  const parsed = schema.safeParse(JSON.parse(event.body ?? '{}'))
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input')

  const existing = await getAuthorProfile(docClient, userId)
  if (!existing) throw new NotFoundError('Author profile not found')
  if (existing.status === 'SUSPENDED' || existing.status === 'DEACTIVATED') {
    throw new ForbiddenError('Author profile is not active')
  }

  const updated = await updateAuthorProfile(docClient, userId, parsed.data)
  return ok(updated)
}
