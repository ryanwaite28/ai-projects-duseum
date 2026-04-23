// =============================================================================
// packages/shared/src/middleware/admin-auth.ts
// Admin group enforcement middleware for Middy.
// Must be placed AFTER cognitoAuthMiddleware in the use() chain so that
// context.userGroups is populated before this runs.
// =============================================================================

import type { MiddlewareObj } from '@middy/core'
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { ForbiddenError } from '../errors/index.js'
import type { DuseumContext, DuseumEvent } from './auth.js'

export const requireAdminMiddleware = (): MiddlewareObj<
  DuseumEvent,
  APIGatewayProxyStructuredResultV2,
  Error,
  DuseumContext
> => ({
  before: async (request) => {
    if (!request.context.userGroups?.includes('ADMIN')) {
      throw new ForbiddenError('Admin access required')
    }
  },
})
