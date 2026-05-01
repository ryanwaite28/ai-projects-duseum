// =============================================================================
// packages/shared/src/db/users.repository.ts
// Repository functions for UserAccount, ViewerProfile, AuthorProfile.
//
// Key design (§4.7):
//   UserAccount    PK=USER#{userId}  SK=PROFILE
//   ViewerProfile  PK=USER#{userId}  SK=PROFILE#VIEWER
//   AuthorProfile  PK=USER#{userId}  SK=PROFILE#AUTHOR
//                  GSI-AuthorDirectory: profileType='AUTHOR' / createdAt
// =============================================================================

import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb'
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import type { AuthorProfile, NotificationPref, UserAccount, ViewerProfile } from '../types/index.js'
import { TABLE_NAME } from './client.js'

// ── Key helpers ───────────────────────────────────────────────────────────────

const userAccountKey = (userId: string) =>
  ({ PK: `USER#${userId}`, SK: 'PROFILE' }) as const

const viewerProfileKey = (userId: string) =>
  ({ PK: `USER#${userId}`, SK: 'PROFILE#VIEWER' }) as const

const authorProfileKey = (userId: string) =>
  ({ PK: `USER#${userId}`, SK: 'PROFILE#AUTHOR' }) as const

// ── UserAccount ───────────────────────────────────────────────────────────────

export const createUserAccount = async (
  client: DynamoDBDocumentClient,
  account: UserAccount
): Promise<void> => {
  try {
    await client.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: { ...userAccountKey(account.userId), ...account },
        ConditionExpression: 'attribute_not_exists(PK)',
      })
    )
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) return
    throw err
  }
}

export const getUserAccount = async (
  client: DynamoDBDocumentClient,
  userId: string
): Promise<UserAccount | null> => {
  const result = await client.send(
    new GetCommand({ TableName: TABLE_NAME, Key: userAccountKey(userId) })
  )
  return (result.Item as UserAccount) ?? null
}

// ── ViewerProfile ─────────────────────────────────────────────────────────────

export const createViewerProfile = async (
  client: DynamoDBDocumentClient,
  profile: ViewerProfile
): Promise<void> => {
  try {
    await client.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: { ...viewerProfileKey(profile.userId), ...profile },
        ConditionExpression: 'attribute_not_exists(PK)',
      })
    )
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) return
    throw err
  }
}

export const getViewerProfile = async (
  client: DynamoDBDocumentClient,
  userId: string
): Promise<ViewerProfile | null> => {
  const result = await client.send(
    new GetCommand({ TableName: TABLE_NAME, Key: viewerProfileKey(userId) })
  )
  return (result.Item as ViewerProfile) ?? null
}

export type UpdateViewerProfileInput = {
  displayName?: string
  notificationGlobalOptOut?: boolean
  defaultNotificationPref?: NotificationPref
}

export const updateViewerProfile = async (
  client: DynamoDBDocumentClient,
  userId: string,
  patch: UpdateViewerProfileInput
): Promise<ViewerProfile> => {
  const sets: string[] = ['#updatedAt = :updatedAt']
  const names: Record<string, string> = { '#updatedAt': 'updatedAt' }
  const values: Record<string, unknown> = { ':updatedAt': new Date().toISOString() }

  if (patch.displayName !== undefined) {
    sets.push('#displayName = :displayName')
    names['#displayName'] = 'displayName'
    values[':displayName'] = patch.displayName
  }
  if (patch.notificationGlobalOptOut !== undefined) {
    sets.push('#ngo = :ngo')
    names['#ngo'] = 'notificationGlobalOptOut'
    values[':ngo'] = patch.notificationGlobalOptOut
  }
  if (patch.defaultNotificationPref !== undefined) {
    sets.push('#dnp = :dnp')
    names['#dnp'] = 'defaultNotificationPref'
    values[':dnp'] = patch.defaultNotificationPref
  }

  const result = await client.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: viewerProfileKey(userId),
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ConditionExpression: 'attribute_exists(PK)',
      ReturnValues: 'ALL_NEW',
    })
  )
  return result.Attributes as ViewerProfile
}

// ── AuthorProfile ─────────────────────────────────────────────────────────────

export const getAuthorProfile = async (
  client: DynamoDBDocumentClient,
  userId: string
): Promise<AuthorProfile | null> => {
  const result = await client.send(
    new GetCommand({ TableName: TABLE_NAME, Key: authorProfileKey(userId) })
  )
  return (result.Item as AuthorProfile) ?? null
}

export const createAuthorProfile = async (
  client: DynamoDBDocumentClient,
  profile: AuthorProfile
): Promise<void> => {
  // profileType='AUTHOR' is written as a top-level attribute for GSI-AuthorDirectory (PK)
  await client.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        ...authorProfileKey(profile.userId),
        ...profile,
        profileType: 'AUTHOR', // GSI-AuthorDirectory PK
      },
      ConditionExpression: 'attribute_not_exists(PK)',
    })
  )
}

export type UpdateAuthorProfileInput = {
  displayName?: string
  bio?: string
  profilePhotoS3Key?: string | null
  coverPhotoS3Key?: string | null
  featuredPieceIds?: string[]
  stripeConnectAccountId?: string | null
  connectChargesEnabled?: boolean | null
  authorSubscriptionPriceId?: string | null
  authorSubscriptionMonthlyUsd?: number | null
}

export const updateAuthorProfile = async (
  client: DynamoDBDocumentClient,
  userId: string,
  patch: UpdateAuthorProfileInput
): Promise<AuthorProfile> => {
  const sets: string[] = ['#updatedAt = :updatedAt']
  const names: Record<string, string> = { '#updatedAt': 'updatedAt' }
  const values: Record<string, unknown> = { ':updatedAt': new Date().toISOString() }

  if (patch.displayName !== undefined) {
    sets.push('#displayName = :displayName')
    names['#displayName'] = 'displayName'
    values[':displayName'] = patch.displayName
  }
  if (patch.bio !== undefined) {
    sets.push('#bio = :bio')
    names['#bio'] = 'bio'
    values[':bio'] = patch.bio
  }
  if (patch.profilePhotoS3Key !== undefined) {
    sets.push('#pps3 = :pps3')
    names['#pps3'] = 'profilePhotoS3Key'
    values[':pps3'] = patch.profilePhotoS3Key
  }
  if (patch.coverPhotoS3Key !== undefined) {
    sets.push('#cps3 = :cps3')
    names['#cps3'] = 'coverPhotoS3Key'
    values[':cps3'] = patch.coverPhotoS3Key
  }
  if (patch.featuredPieceIds !== undefined) {
    sets.push('#fpi = :fpi')
    names['#fpi'] = 'featuredPieceIds'
    values[':fpi'] = patch.featuredPieceIds
  }
  if (patch.stripeConnectAccountId !== undefined) {
    sets.push('#scaId = :scaId')
    names['#scaId'] = 'stripeConnectAccountId'
    values[':scaId'] = patch.stripeConnectAccountId
  }
  if (patch.connectChargesEnabled !== undefined) {
    sets.push('#cce = :cce')
    names['#cce'] = 'connectChargesEnabled'
    values[':cce'] = patch.connectChargesEnabled
  }
  if (patch.authorSubscriptionPriceId !== undefined) {
    sets.push('#aspId = :aspId')
    names['#aspId'] = 'authorSubscriptionPriceId'
    values[':aspId'] = patch.authorSubscriptionPriceId
  }
  if (patch.authorSubscriptionMonthlyUsd !== undefined) {
    sets.push('#asmUsd = :asmUsd')
    names['#asmUsd'] = 'authorSubscriptionMonthlyUsd'
    values[':asmUsd'] = patch.authorSubscriptionMonthlyUsd
  }

  const result = await client.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: authorProfileKey(userId),
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ConditionExpression: 'attribute_exists(PK)',
      ReturnValues: 'ALL_NEW',
    })
  )
  return result.Attributes as AuthorProfile
}

export const incrementAuthorFollowerCount = async (
  client: DynamoDBDocumentClient,
  authorId: string
): Promise<void> => {
  await client.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: authorProfileKey(authorId),
      UpdateExpression: 'ADD followerCount :one',
      ExpressionAttributeValues: { ':one': 1 },
    })
  )
}

export const decrementAuthorFollowerCount = async (
  client: DynamoDBDocumentClient,
  authorId: string
): Promise<void> => {
  await client.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: authorProfileKey(authorId),
      UpdateExpression: 'ADD followerCount :neg',
      ExpressionAttributeValues: { ':neg': -1 },
    })
  )
}

/**
 * Updates the `status` field on a ViewerProfile or AuthorProfile.
 * Used by admin-lambda to suspend or reinstate profiles (FR-ADMIN-02).
 * Throws ConditionalCheckFailedException if the profile item does not exist.
 */
export const updateProfileStatus = async (
  client: DynamoDBDocumentClient,
  userId: string,
  profileType: 'VIEWER' | 'AUTHOR',
  status: string,
  updatedAt: string
): Promise<void> => {
  const key = profileType === 'VIEWER' ? viewerProfileKey(userId) : authorProfileKey(userId)
  await client.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: key,
      UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt',
      ConditionExpression: 'attribute_exists(PK)',
      ExpressionAttributeNames: { '#status': 'status', '#updatedAt': 'updatedAt' },
      ExpressionAttributeValues: { ':status': status, ':updatedAt': updatedAt },
    })
  )
}
