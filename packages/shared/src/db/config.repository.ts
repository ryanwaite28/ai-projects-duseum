// =============================================================================
// packages/shared/src/db/config.repository.ts
// Config table reads — Section 4.7 (config table design)
//
// Config items use a single-attribute key: PK = config key name (no SK).
// e.g. { PK: 'WEEKLY_FEATURE_FEE_USD', value: 25 }
//      { PK: 'DAILY_FEATURED_AUTHOR', authorId: '...', selectedAt: '...', ... }
// =============================================================================

import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { CONFIG_TABLE_NAME, TABLE_NAME } from './client.js'

// ── Generic numeric config ─────────────────────────────────────────────────────

export const getConfigNumber = async (
  client: DynamoDBDocumentClient,
  key: string,
  defaultValue: number
): Promise<number> => {
  const result = await client.send(
    new GetCommand({ TableName: CONFIG_TABLE_NAME, Key: { PK: key } })
  )
  return (result.Item?.value as number | undefined) ?? defaultValue
}

// ── Daily Featured Author ──────────────────────────────────────────────────────

export type DailyFeaturedAuthorConfig = {
  authorId: string
  selectedAt: string
  selectionMethod: 'RANDOM' | 'ADMIN_OVERRIDE'
  overriddenBy?: string | null
}

export const getDailyFeaturedAuthor = async (
  client: DynamoDBDocumentClient
): Promise<DailyFeaturedAuthorConfig | null> => {
  const result = await client.send(
    new GetCommand({ TableName: CONFIG_TABLE_NAME, Key: { PK: 'DAILY_FEATURED_AUTHOR' } })
  )
  if (!result.Item) return null
  const { authorId, selectedAt, selectionMethod, overriddenBy } = result.Item as Record<string, unknown>
  return {
    authorId:        authorId as string,
    selectedAt:      selectedAt as string,
    selectionMethod: selectionMethod as 'RANDOM' | 'ADMIN_OVERRIDE',
    overriddenBy:    (overriddenBy as string | null | undefined) ?? null,
  }
}

/**
 * Writes (or overwrites) the DAILY_FEATURED_AUTHOR config entry.
 * Called by maintenance-lambda after daily random selection.
 */
export const setDailyFeaturedAuthor = async (
  client: DynamoDBDocumentClient,
  config: DailyFeaturedAuthorConfig
): Promise<void> => {
  await client.send(
    new PutCommand({
      TableName: CONFIG_TABLE_NAME,
      Item: {
        PK:              'DAILY_FEATURED_AUTHOR',
        authorId:        config.authorId,
        selectedAt:      config.selectedAt,
        selectionMethod: config.selectionMethod,
        ...(config.overriddenBy != null ? { overriddenBy: config.overriddenBy } : {}),
      },
    })
  )
}

// ── Daily feature exclusions ───────────────────────────────────────────────────

/**
 * Returns the DAILY_FEATURED_EXCLUSIONS list (last 7 authorIds). Defaults to [].
 */
export const getDailyFeatureExclusions = async (
  client: DynamoDBDocumentClient
): Promise<string[]> => {
  const result = await client.send(
    new GetCommand({ TableName: CONFIG_TABLE_NAME, Key: { PK: 'DAILY_FEATURED_EXCLUSIONS' } })
  )
  return (result.Item?.authorIds as string[] | undefined) ?? []
}

/**
 * Overwrites the DAILY_FEATURED_EXCLUSIONS list.
 */
export const setDailyFeatureExclusions = async (
  client: DynamoDBDocumentClient,
  authorIds: string[]
): Promise<void> => {
  await client.send(
    new PutCommand({
      TableName: CONFIG_TABLE_NAME,
      Item: { PK: 'DAILY_FEATURED_EXCLUSIONS', authorIds },
    })
  )
}

// ── DailyFeatureLog ────────────────────────────────────────────────────────────

export type DailyFeatureLogInput = {
  date: string                              // 'YYYY-MM-DD'
  authorId: string
  selectedAt: string
  selectionMethod: 'RANDOM' | 'ADMIN_OVERRIDE'
  overriddenBy: string | null
}

/**
 * Writes a DailyFeatureLog record to the main table.
 * Key: PK=FEATURE#DAILY, SK=DATE#{date}
 */
export const writeDailyFeatureLog = async (
  client: DynamoDBDocumentClient,
  log: DailyFeatureLogInput
): Promise<void> => {
  await client.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK:              'FEATURE#DAILY',
        SK:              `DATE#${log.date}`,
        date:            log.date,
        authorId:        log.authorId,
        selectedAt:      log.selectedAt,
        selectionMethod: log.selectionMethod,
        overriddenBy:    log.overriddenBy,
      },
    })
  )
}

// ── Weekly feature config (batched read) ──────────────────────────────────────

export type WeeklyFeatureConfig = {
  feeUsd: number
  slotCount: number
  advanceWeeks: number
}

export const getWeeklyFeatureConfig = async (
  client: DynamoDBDocumentClient
): Promise<WeeklyFeatureConfig> => {
  const [feeUsd, slotCount, advanceWeeks] = await Promise.all([
    getConfigNumber(client, 'WEEKLY_FEATURE_FEE_USD', 25),
    getConfigNumber(client, 'WEEKLY_FEATURE_SLOT_COUNT', 10),
    getConfigNumber(client, 'WEEKLY_FEATURE_ADVANCE_WEEKS', 8),
  ])
  return { feeUsd, slotCount, advanceWeeks }
}

/**
 * Writes (or overwrites) a single config table entry with { PK: key, value }.
 * Used by admin-lambda PUT /admin/config to update platform settings (FR-ADMIN-05).
 */
export const setConfigValue = async (
  client: DynamoDBDocumentClient,
  key: string,
  value: unknown
): Promise<void> => {
  await client.send(
    new PutCommand({
      TableName: CONFIG_TABLE_NAME,
      Item: { PK: key, value },
    })
  )
}
