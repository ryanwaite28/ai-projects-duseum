// =============================================================================
// lambdas/users/src/routes/create-author.ts
// POST /users/me/author — Author onboarding (§8.4, FR-AUTH-PROF-01)
//
// Creates AuthorProfile with status=ACTIVE when required fields are present.
// Returns 409 if author profile already exists.
// =============================================================================

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { z } from 'zod'
import {
  ConflictError,
  UnauthorizedError,
  ValidationError,
  createAuthorProfile,
  docClient,
  getAuthorProfile,
} from '@duseum/shared'
import type { DuseumContext } from '@duseum/shared'

const schema = z.object({
  displayName: z.string().min(1).max(100),
  bio: z.string().min(1).max(2000),
  authorSubscriptionPriceUsd: z.number().min(1).max(50).optional(),
})

export const createAuthor = async (
  event: APIGatewayProxyEventV2,
  context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2> => {
  const { userId } = context
  if (!userId) throw new UnauthorizedError()

  const parsed = schema.safeParse(JSON.parse(event.body ?? '{}'))
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid input')

  const existing = await getAuthorProfile(docClient, userId)
  if (existing) throw new ConflictError('Author profile already exists')

  const now = new Date().toISOString()
  const profile = {
    userId,
    profileType: 'AUTHOR' as const,
    status: 'ACTIVE' as const,
    displayName: parsed.data.displayName,
    bio: parsed.data.bio,
    profilePhotoS3Key: null,
    coverPhotoS3Key: null,
    stripeConnectAccountId: null,
    authorSubscriptionPriceId: null,
    authorSubscriptionMonthlyUsd: parsed.data.authorSubscriptionPriceUsd ?? null,
    featuredPieceIds: [] as string[],
    createdAt: now,
    totalPiecesCount: 0,
    followerCount: 0,
    subscriberCount: 0,
  }

  await createAuthorProfile(docClient, profile)

  return {
    statusCode: 201,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  }
}
