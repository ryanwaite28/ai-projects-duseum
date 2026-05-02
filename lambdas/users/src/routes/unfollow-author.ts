// DELETE /follows/authors/{authorId} — FR-VIEW-06a, §8.8
// Auth required. Deletes Follow + NotificationPreference records.

import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb'
import {
  UnauthorizedError,
  docClient,
  TABLE_NAME,
  getFollow,
  ok,
} from '@duseum/shared'
import type { DuseumContext } from '@duseum/shared'

export const unfollowAuthor = async (
  context: DuseumContext,
  authorId: string
): Promise<APIGatewayProxyStructuredResultV2> => {
  if (!context.userId) throw new UnauthorizedError()
  const viewerId = context.userId

  const existing = await getFollow(docClient, viewerId, authorId)
  if (!existing) return ok({ authorId, unfollowedAt: new Date().toISOString() })

  const unfollowedAt = new Date().toISOString()

  await docClient.send(new TransactWriteCommand({
    TransactItems: [
      {
        Delete: {
          TableName: TABLE_NAME,
          Key: { PK: `USER#${viewerId}`, SK: `FOLLOW#AUTHOR#${authorId}` },
        },
      },
      {
        Delete: {
          TableName: TABLE_NAME,
          Key: { PK: `USER#${viewerId}`, SK: `NOTIF_PREF#AUTHOR#${authorId}` },
        },
      },
      {
        Update: {
          TableName:                 TABLE_NAME,
          Key:                       { PK: `USER#${authorId}`, SK: 'PROFILE#AUTHOR' },
          UpdateExpression:          'ADD followerCount :neg',
          ExpressionAttributeValues: { ':neg': -1 },
          ConditionExpression:       'attribute_exists(PK)',
        },
      },
    ],
  }))

  return ok({ authorId, unfollowedAt })
}
