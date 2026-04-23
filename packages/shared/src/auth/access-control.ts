// =============================================================================
// packages/shared/src/auth/access-control.ts
// Art piece access tier enforcement — Section 6.5
//
// Called from artworks-lambda on every art piece read.
// NEVER enforce access control in the frontend only (Critical Rule #5).
// =============================================================================

import type { ArtPiece } from '../types/index.js'

export type AccessContext = {
  viewerId: string
  isAuthor: boolean           // is this the Author of the piece?
  isPlatformSubscriber: boolean
  isAuthorSubscriber: boolean // subscribed to this specific Author
}

export type AccessDecision =
  | { allowed: true;  signUrl: boolean }
  | { allowed: false; reason: 'REQUIRES_PLATFORM_SUB' | 'REQUIRES_AUTHOR_SUB' | 'FORBIDDEN' }

/**
 * Determines whether a viewer may access an art piece and whether a signed
 * CloudFront URL must be generated.
 *
 * @param piece           - The art piece record from DynamoDB
 * @param ctx             - Viewer's access context (subscription state, ownership)
 * @param freeTierLimit   - Platform-configured free piece count (from config table)
 * @param authorPieceIndex - 1-based rank of this piece in the Author's public gallery
 */
export const checkArtPieceAccess = (
  piece: ArtPiece,
  ctx: AccessContext,
  freeTierLimit: number,
  authorPieceIndex: number
): AccessDecision => {
  // Author can always see their own work in any visibility state.
  // DRAFT pieces use signUrl so they're served through the private CDK path.
  if (ctx.isAuthor) return { allowed: true, signUrl: piece.visibility === 'DRAFT' }

  // PRIVATE pieces require an active Author subscription.
  if (piece.visibility === 'PRIVATE') {
    if (ctx.isAuthorSubscriber) return { allowed: true, signUrl: true }
    return { allowed: false, reason: 'REQUIRES_AUTHOR_SUB' }
  }

  // DRAFT pieces: Author-only (already handled above).
  if (piece.visibility === 'DRAFT') return { allowed: false, reason: 'FORBIDDEN' }

  // PUBLIC pieces: check free tier limit first, then platform subscription.
  if (authorPieceIndex <= freeTierLimit) return { allowed: true, signUrl: false }
  if (ctx.isPlatformSubscriber)          return { allowed: true, signUrl: false }

  return { allowed: false, reason: 'REQUIRES_PLATFORM_SUB' }
}
