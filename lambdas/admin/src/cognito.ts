// =============================================================================
// lambdas/admin/src/cognito.ts
// Thin Cognito Identity Provider wrappers for admin-lambda.
// All functions respect COGNITO_USER_POOL_ID env var injected by CDK.
// Mocked in integration tests — never hits real Cognito locally.
// =============================================================================

import {
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  CognitoIdentityProviderClient,
  DescribeUserPoolCommand,
  ListUsersCommand,
  type UserType,
} from '@aws-sdk/client-cognito-identity-provider'

const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!

let _client: CognitoIdentityProviderClient | null = null

const getClient = (): CognitoIdentityProviderClient => {
  if (!_client) {
    _client = new CognitoIdentityProviderClient({
      region: process.env.AWS_REGION ?? 'us-east-1',
      ...(process.env.AWS_ENDPOINT_URL
        ? { endpoint: process.env.AWS_ENDPOINT_URL }
        : {}),
    })
  }
  return _client
}

export type CognitoUserSummary = {
  userId:     string   // Cognito 'sub' attribute
  email:      string
  enabled:    boolean
  userStatus: string
  createdAt:  string
}

const mapUser = (u: UserType): CognitoUserSummary => {
  const attrs = Object.fromEntries((u.Attributes ?? []).map((a) => [a.Name, a.Value]))
  return {
    userId:     attrs['sub']   ?? u.Username ?? '',
    email:      attrs['email'] ?? '',
    enabled:    u.Enabled      ?? true,
    userStatus: u.UserStatus   ?? 'UNKNOWN',
    createdAt:  u.UserCreateDate?.toISOString() ?? '',
  }
}

export const cognitoListUsers = async (
  emailFilter?:     string,
  paginationToken?: string,
  limit = 20
): Promise<{ users: CognitoUserSummary[]; nextToken: string | null }> => {
  const result = await getClient().send(
    new ListUsersCommand({
      UserPoolId:      USER_POOL_ID,
      Limit:           Math.min(limit, 60),
      Filter:          emailFilter ? `email ^= "${emailFilter}"` : undefined,
      PaginationToken: paginationToken,
    })
  )
  return {
    users:     (result.Users ?? []).map(mapUser),
    nextToken: result.PaginationToken ?? null,
  }
}

export const cognitoAdminDisableUser = async (userId: string): Promise<void> => {
  await getClient().send(
    new AdminDisableUserCommand({ UserPoolId: USER_POOL_ID, Username: userId })
  )
}

export const cognitoAdminEnableUser = async (userId: string): Promise<void> => {
  await getClient().send(
    new AdminEnableUserCommand({ UserPoolId: USER_POOL_ID, Username: userId })
  )
}

export const cognitoDescribeUserPool = async (): Promise<{ estimatedNumberOfUsers: number }> => {
  const result = await getClient().send(
    new DescribeUserPoolCommand({ UserPoolId: USER_POOL_ID })
  )
  return { estimatedNumberOfUsers: result.UserPool?.EstimatedNumberOfUsers ?? 0 }
}
