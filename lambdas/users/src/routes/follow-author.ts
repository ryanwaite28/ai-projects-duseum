// POST /follows/authors/{authorId} — FR-VIEW-06, §8.8
// Auth required. Creates Follow + NotificationPreference records.

import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb'
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  docClient,
  TABLE_NAME,
  getAuthorProfile,
  getViewerProfile,
  getFollow,
  ok,
} from '@duseum/shared'
import type { DuseumContext } from '@duseum/shared'

export const followAuthor = async (
  context: DuseumContext,
  authorId: string
): Promise<APIGatewayProxyStructuredResultV2> => {
  if (!context.userId) throw new UnauthorizedError()
  const viewerId = context.userId

  if (viewerId === authorId) throw new ValidationError('You cannot follow yourself.')

  const [author, viewer, existing] = await Promise.all([
    getAuthorProfile(docClient, authorId),
    getViewerProfile(docClient, viewerId),
    getFollow(docClient, viewerId, authorId),
  ])

  if (!viewer || viewer.status !== 'ACTIVE') throw new ForbiddenError('Active viewer profile required.')
  if (!author) throw new NotFoundError('Author not found')
  if (existing) throw new ConflictError('Already following this author')

  const followedAt  = new Date().toISOString()
  const defaultPref = viewer?.defaultNotificationPref ?? 'ALL_NEW_PIECES'

  await docClient.send(new TransactWriteCommand({
    TransactItems: [
      {
        Put: {
          TableName: TABLE_NAME,
          Item: {
            PK:         `USER#${viewerId}`,
            SK:         `FOLLOW#AUTHOR#${authorId}`,
            viewerId,
            authorId,
            followedAt,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      {
        Put: {
          TableName: TABLE_NAME,
          Item: {
            PK:        `USER#${viewerId}`,
            SK:        `NOTIF_PREF#AUTHOR#${authorId}`,
            viewerId,
            authorId,
            pref:      defaultPref,
            updatedAt: followedAt,
          },
          // Don't overwrite an existing preference (e.g. from a previous follow-unfollow cycle)
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      {
        Update: {
          TableName:                 TABLE_NAME,
          Key:                       { PK: `USER#${authorId}`, SK: 'PROFILE#AUTHOR' },
          UpdateExpression:          'ADD followerCount :one',
          ExpressionAttributeValues: { ':one': 1 },
          ConditionExpression:       'attribute_exists(PK)',
        },
      },
    ],
  }))

  return ok({ authorId, followedAt, notificationPref: defaultPref })
}
