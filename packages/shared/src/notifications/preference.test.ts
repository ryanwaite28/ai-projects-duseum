// =============================================================================
// packages/shared/src/notifications/preference.test.ts
// Unit tests for resolveNotificationPref — FR-NOTIF-07, Section 15.2
// =============================================================================

import { describe, it, expect } from 'vitest'
import { resolveNotificationPref } from './index.js'
import type { ViewerProfile } from '../types/index.js'

// ── Fixtures ─────────────────────────────────────────────────────────────────

const viewer = (overrides: Partial<ViewerProfile> = {}): ViewerProfile => ({
  userId: 'viewer-1',
  profileType: 'VIEWER',
  status: 'ACTIVE',
  displayName: 'Test Viewer',
  createdAt: '2025-01-01T00:00:00Z',
  notificationGlobalOptOut: false,
  defaultNotificationPref: 'ALL_NEW_PIECES',
  ...overrides,
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('resolveNotificationPref', () => {
  it('returns NONE when global opt-out is true, regardless of per-author override', () => {
    expect(
      resolveNotificationPref(
        viewer({ notificationGlobalOptOut: true }),
        'ALL_NEW_PIECES' // override ignored
      )
    ).toBe('NONE')
  })

  it('returns NONE when global opt-out is true and no per-author override', () => {
    expect(
      resolveNotificationPref(viewer({ notificationGlobalOptOut: true }))
    ).toBe('NONE')
  })

  it('returns per-author override when global opt-out is false', () => {
    expect(
      resolveNotificationPref(viewer(), 'NONE')
    ).toBe('NONE')
  })

  it('returns per-author PUBLIC_ONLY override', () => {
    expect(
      resolveNotificationPref(viewer(), 'PUBLIC_ONLY')
    ).toBe('PUBLIC_ONLY')
  })

  it('returns per-author ALL_NEW_PIECES override', () => {
    expect(
      resolveNotificationPref(viewer({ defaultNotificationPref: 'NONE' }), 'ALL_NEW_PIECES')
    ).toBe('ALL_NEW_PIECES')
  })

  it('falls back to defaultNotificationPref when no per-author override', () => {
    expect(
      resolveNotificationPref(viewer({ defaultNotificationPref: 'ALL_NEW_PIECES' }))
    ).toBe('ALL_NEW_PIECES')
  })

  it('falls back to PUBLIC_ONLY default when no per-author override', () => {
    expect(
      resolveNotificationPref(viewer({ defaultNotificationPref: 'PUBLIC_ONLY' }))
    ).toBe('PUBLIC_ONLY')
  })

  it('falls back to NONE default when no per-author override', () => {
    expect(
      resolveNotificationPref(viewer({ defaultNotificationPref: 'NONE' }))
    ).toBe('NONE')
  })

  it('global opt-out takes precedence over NONE default and PUBLIC_ONLY override', () => {
    expect(
      resolveNotificationPref(
        viewer({ notificationGlobalOptOut: true, defaultNotificationPref: 'NONE' }),
        'PUBLIC_ONLY'
      )
    ).toBe('NONE')
  })
})
