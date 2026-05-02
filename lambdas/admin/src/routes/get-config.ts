// GET /admin/config — read all platform configuration values.
// FR-ADMIN-05: Admins can read current platform-level settings.

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  docClient,
  getPlatformConfig,
  ok,
} from '@duseum/shared'

export const getConfig = async (
  _event: APIGatewayProxyEventV2,
  _context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2> => {
  const config = await getPlatformConfig(docClient)
  return ok(config)
}
