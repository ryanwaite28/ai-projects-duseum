// =============================================================================
// lambdas/artworks/src/routes/create-collection.ts
// POST /collections — FR-COL-01, §8.5
// Author only. Creates a named collection with optional description and visibility.
// =============================================================================

import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  ForbiddenError,
  ValidationError,
  created,
  createCollection,
  docClient,
  getAuthorProfile,
  validateBody,
} from '@duseum/shared'

const CreateCollectionSchema = z.object({
  title:        z.string().min(1).max(100),
  description:  z.string().max(500).optional().default(''),
  visibility:   z.enum(['FREE', 'SUBSCRIBER_ONLY']).default('FREE'),
  posterS3Key:  z.string().min(1).optional().nullable(),
})

export const createCollectionRoute = async (
  event: APIGatewayProxyEventV2,
  context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2> => {
  const { userId } = context

  const authorProfile = await getAuthorProfile(docClient, userId)
  if (!authorProfile || authorProfile.status !== 'ACTIVE') {
    throw new ForbiddenError('An active Author profile is required to create collections')
  }

  const body = validateBody(CreateCollectionSchema, event.body)

  const collectionId = randomUUID()
  const now          = new Date().toISOString()

  const collection = {
    collectionId,
    ownerId:      userId,
    title:        body.title,
    description:  body.description,
    visibility:   body.visibility,
    posterS3Key:  body.posterS3Key ?? null,
    createdAt:    now,
    updatedAt:    now,
  }

  await createCollection(docClient, collection)

  return created(collection)
}

// Suppress unused-import warning — ValidationError used indirectly via validateBody
void ValidationError
