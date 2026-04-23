// PUT /admin/config — update platform configuration values.
// FR-ADMIN-05: Admins can configure platform-level settings.
//
// Each present field maps to a config table key. All writes are parallel PutItem ops.
// Note: freeTierLimit changes take effect on next Lambda cold start (cached per-container).

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { DuseumContext } from '@duseum/shared'
import {
  ValidationError,
  docClient,
  ok,
  setConfigValue,
} from '@duseum/shared'

type ConfigBody = {
  freeTierLimit?:           number
  platformSubPriceId?:      string
  platformCutPercent?:      number
  weeklyFeatureFeeUsd?:     number
  weeklyFeatureSlotCount?:  number
  weeklyFeatureAdvanceWeeks?: number
}

const CONFIG_MAP: Array<{
  field:    keyof ConfigBody
  key:      string
  validate: (v: unknown) => boolean
  hint:     string
}> = [
  { field: 'freeTierLimit',           key: 'FREE_TIER_LIMIT',              validate: (v) => Number.isInteger(v) && (v as number) > 0,      hint: 'positive integer' },
  { field: 'platformSubPriceId',      key: 'PLATFORM_SUB_PRICE_ID',        validate: (v) => typeof v === 'string' && v.length > 0,         hint: 'non-empty string' },
  { field: 'platformCutPercent',      key: 'PLATFORM_CUT_PERCENT',         validate: (v) => typeof v === 'number' && (v as number) >= 0 && (v as number) <= 100, hint: '0-100' },
  { field: 'weeklyFeatureFeeUsd',     key: 'WEEKLY_FEATURE_FEE_USD',       validate: (v) => typeof v === 'number' && (v as number) > 0,    hint: 'positive number' },
  { field: 'weeklyFeatureSlotCount',  key: 'WEEKLY_FEATURE_SLOT_COUNT',    validate: (v) => Number.isInteger(v) && (v as number) > 0,      hint: 'positive integer' },
  { field: 'weeklyFeatureAdvanceWeeks', key: 'WEEKLY_FEATURE_ADVANCE_WEEKS', validate: (v) => Number.isInteger(v) && (v as number) > 0,    hint: 'positive integer' },
]

export const updateConfig = async (
  event: APIGatewayProxyEventV2,
  _context: DuseumContext
): Promise<APIGatewayProxyStructuredResultV2> => {
  const body = (event.body ? JSON.parse(event.body) : {}) as ConfigBody

  const writes: Array<Promise<void>> = []
  const updated: string[] = []

  for (const { field, key, validate, hint } of CONFIG_MAP) {
    const val = body[field]
    if (val === undefined) continue

    if (!validate(val)) {
      throw new ValidationError(`${field} must be ${hint}`)
    }

    writes.push(setConfigValue(docClient, key, val))
    updated.push(field)
  }

  if (writes.length === 0) {
    throw new ValidationError('Request body must contain at least one configurable field')
  }

  await Promise.all(writes)

  return ok({ updated, updatedAt: new Date().toISOString() })
}
