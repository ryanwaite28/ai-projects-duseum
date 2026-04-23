// GET /notifications/unsubscribe?token=... — FR-NOTIF-08, §8.8
// Public — no JWT required. Verifies signed token, sets pref to NONE.

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import {
  ValidationError,
  docClient,
  getAuthorProfile,
  upsertPreference,
  verifyUnsubscribeToken,
  ok,
} from '@duseum/shared'

export const unsubscribe = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  const token = event.queryStringParameters?.['token']
  if (!token) throw new ValidationError('token query parameter is required')

  const { viewerId, authorId } = await verifyUnsubscribeToken(token)

  await upsertPreference(docClient, viewerId, authorId, 'NONE')

  const author = await getAuthorProfile(docClient, authorId)
  const authorDisplayName = author?.displayName ?? authorId

  return ok({
    message:            `You have been unsubscribed from new-piece notifications for ${authorDisplayName}.`,
    authorId,
    authorDisplayName,
  })
}
