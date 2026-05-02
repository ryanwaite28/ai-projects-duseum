// =============================================================================
// lambdas/social/src/__tests__/social.integration.test.ts
// Integration tests for social-lambda — Section 15.3, FR-SOC-01–05
//
// Prerequisites: MiniStack running at localhost:4566
// Table:  duseum-test-social
// =============================================================================

import { describe, it, expect } from 'vitest'
import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { handler } from '../index.js'
import { docClient, TABLE, makeCtx, makeEvent, seedArtwork } from './setup.js'

// ── Constants ─────────────────────────────────────────────────────────────────

const ARTWORK_AUTHOR = 'user-artwork-author'
const VIEWER_A       = 'user-viewer-aaa'
const VIEWER_B       = 'user-viewer-bbb'
const ARTWORK_ID     = 'artwork-social-test-001'
const ARTWORK_NO_CMT = 'artwork-social-no-comments'

// ── Helpers ───────────────────────────────────────────────────────────────────

type HandlerResult = { statusCode: number; body: string }

const callHandler = async (event: unknown): Promise<HandlerResult> => {
  const result = await handler(event as never, makeCtx())
  return result as HandlerResult
}

const getArtworkMeta = () =>
  docClient.send(new GetCommand({
    TableName: TABLE,
    Key: { PK: `ARTWORK#${ARTWORK_ID}`, SK: 'METADATA' },
  }))

// ═══════════════════════════════════════════════════════════════════════════════
// Comments
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /artworks/{artworkId}/comments', () => {
  it('posts a comment and it appears in list', async () => {
    await seedArtwork(ARTWORK_ID, ARTWORK_AUTHOR)

    const post = await callHandler(makeEvent(
      'POST', `/artworks/${ARTWORK_ID}/comments`,
      { userId: VIEWER_A, body: { body: 'Great piece!' }, pathParameters: { artworkId: ARTWORK_ID } }
    ))
    expect(post.statusCode).toBe(201)
    const created = JSON.parse(post.body)
    expect(created.body).toBe('Great piece!')
    expect(created.commentId).toBeTruthy()
    expect(created.authorId).toBe(VIEWER_A)
    expect(created.parentCommentId).toBeNull()

    const list = await callHandler(makeEvent(
      'GET', `/artworks/${ARTWORK_ID}/comments`,
      { pathParameters: { artworkId: ARTWORK_ID } }
    ))
    expect(list.statusCode).toBe(200)
    const items = JSON.parse(list.body).items
    expect(items).toHaveLength(1)
    expect(items[0].commentId).toBe(created.commentId)

    const meta = await getArtworkMeta()
    expect(meta.Item?.commentCount).toBe(1)
  })

  it('posts a reply to a top-level comment', async () => {
    await seedArtwork(ARTWORK_ID, ARTWORK_AUTHOR)

    const postParent = await callHandler(makeEvent(
      'POST', `/artworks/${ARTWORK_ID}/comments`,
      { userId: VIEWER_A, body: { body: 'Original comment' }, pathParameters: { artworkId: ARTWORK_ID } }
    ))
    const parent = JSON.parse(postParent.body)

    const postReply = await callHandler(makeEvent(
      'POST', `/artworks/${ARTWORK_ID}/comments`,
      {
        userId:         VIEWER_B,
        body:           { body: 'Replying here', parentCommentId: parent.commentId },
        pathParameters: { artworkId: ARTWORK_ID },
      }
    ))
    expect(postReply.statusCode).toBe(201)
    const reply = JSON.parse(postReply.body)
    expect(reply.parentCommentId).toBe(parent.commentId)
    expect(reply.authorId).toBe(VIEWER_B)
  })

  it('rejects reply to a reply (one-level nesting only)', async () => {
    await seedArtwork(ARTWORK_ID, ARTWORK_AUTHOR)

    const postParent = await callHandler(makeEvent(
      'POST', `/artworks/${ARTWORK_ID}/comments`,
      { userId: VIEWER_A, body: { body: 'Top-level' }, pathParameters: { artworkId: ARTWORK_ID } }
    ))
    const parent = JSON.parse(postParent.body)

    const postReply = await callHandler(makeEvent(
      'POST', `/artworks/${ARTWORK_ID}/comments`,
      {
        userId:         VIEWER_B,
        body:           { body: 'Reply', parentCommentId: parent.commentId },
        pathParameters: { artworkId: ARTWORK_ID },
      }
    ))
    const reply = JSON.parse(postReply.body)

    const postDeep = await callHandler(makeEvent(
      'POST', `/artworks/${ARTWORK_ID}/comments`,
      {
        userId:         VIEWER_A,
        body:           { body: 'Nested reply', parentCommentId: reply.commentId },
        pathParameters: { artworkId: ARTWORK_ID },
      }
    ))
    expect(postDeep.statusCode).toBe(400)
  })

  it('returns 403 when comments are disabled on the artwork', async () => {
    await seedArtwork(ARTWORK_NO_CMT, ARTWORK_AUTHOR, { commentsEnabled: false })

    const res = await callHandler(makeEvent(
      'POST', `/artworks/${ARTWORK_NO_CMT}/comments`,
      { userId: VIEWER_A, body: { body: 'Hello' }, pathParameters: { artworkId: ARTWORK_NO_CMT } }
    ))
    expect(res.statusCode).toBe(403)
  })

  it('returns 400 when comment body exceeds 1,000 characters', async () => {
    await seedArtwork(ARTWORK_ID, ARTWORK_AUTHOR)

    const res = await callHandler(makeEvent(
      'POST', `/artworks/${ARTWORK_ID}/comments`,
      {
        userId:         VIEWER_A,
        body:           { body: 'x'.repeat(1001) },
        pathParameters: { artworkId: ARTWORK_ID },
      }
    ))
    expect(res.statusCode).toBe(400)
  })

  it('returns 401 when not authenticated', async () => {
    await seedArtwork(ARTWORK_ID, ARTWORK_AUTHOR)

    const res = await callHandler(makeEvent(
      'POST', `/artworks/${ARTWORK_ID}/comments`,
      { body: { body: 'No token' }, pathParameters: { artworkId: ARTWORK_ID } }
    ))
    expect(res.statusCode).toBe(401)
  })
})

describe('DELETE /comments/{commentId}', () => {
  it('allows the comment author to delete their own comment', async () => {
    await seedArtwork(ARTWORK_ID, ARTWORK_AUTHOR)

    const post = await callHandler(makeEvent(
      'POST', `/artworks/${ARTWORK_ID}/comments`,
      { userId: VIEWER_A, body: { body: 'Delete me' }, pathParameters: { artworkId: ARTWORK_ID } }
    ))
    const { commentId } = JSON.parse(post.body)

    const del = await callHandler(makeEvent(
      'DELETE', `/comments/${commentId}`,
      { userId: VIEWER_A, pathParameters: { commentId } }
    ))
    expect(del.statusCode).toBe(204)

    const list = await callHandler(makeEvent(
      'GET', `/artworks/${ARTWORK_ID}/comments`,
      { pathParameters: { artworkId: ARTWORK_ID } }
    ))
    const items = JSON.parse(list.body).items
    const found = items.find((c: { commentId: string }) => c.commentId === commentId)
    expect(found?.isDeleted).toBe(true)

    const meta = await getArtworkMeta()
    expect(meta.Item?.commentCount).toBe(0)
  })

  it('allows the artwork author to delete any comment on their piece', async () => {
    await seedArtwork(ARTWORK_ID, ARTWORK_AUTHOR)

    const post = await callHandler(makeEvent(
      'POST', `/artworks/${ARTWORK_ID}/comments`,
      { userId: VIEWER_A, body: { body: 'Someone else comment' }, pathParameters: { artworkId: ARTWORK_ID } }
    ))
    const { commentId } = JSON.parse(post.body)

    const del = await callHandler(makeEvent(
      'DELETE', `/comments/${commentId}`,
      { userId: ARTWORK_AUTHOR, pathParameters: { commentId } }
    ))
    expect(del.statusCode).toBe(204)
  })

  it('returns 403 when a non-owner tries to delete another user comment', async () => {
    await seedArtwork(ARTWORK_ID, ARTWORK_AUTHOR)

    const post = await callHandler(makeEvent(
      'POST', `/artworks/${ARTWORK_ID}/comments`,
      { userId: VIEWER_A, body: { body: 'Protected comment' }, pathParameters: { artworkId: ARTWORK_ID } }
    ))
    const { commentId } = JSON.parse(post.body)

    const del = await callHandler(makeEvent(
      'DELETE', `/comments/${commentId}`,
      { userId: VIEWER_B, pathParameters: { commentId } }
    ))
    expect(del.statusCode).toBe(403)
  })
})

describe('GET /artworks/{artworkId}/comments', () => {
  it('returns paginated results with nextCursor when more items exist', async () => {
    await seedArtwork(ARTWORK_ID, ARTWORK_AUTHOR)

    // Post 5 comments
    for (let i = 0; i < 5; i++) {
      await callHandler(makeEvent(
        'POST', `/artworks/${ARTWORK_ID}/comments`,
        {
          userId:         VIEWER_A,
          body:           { body: `Comment ${i}` },
          pathParameters: { artworkId: ARTWORK_ID },
        }
      ))
    }

    const page1 = await callHandler(makeEvent(
      'GET', `/artworks/${ARTWORK_ID}/comments`,
      {
        pathParameters:        { artworkId: ARTWORK_ID },
        queryStringParameters: { limit: '3' },
      }
    ))
    expect(page1.statusCode).toBe(200)
    const p1Body = JSON.parse(page1.body)
    expect(p1Body.items).toHaveLength(3)
    expect(p1Body.nextCursor).toBeTruthy()

    const page2 = await callHandler(makeEvent(
      'GET', `/artworks/${ARTWORK_ID}/comments`,
      {
        pathParameters:        { artworkId: ARTWORK_ID },
        queryStringParameters: { limit: '3', cursor: p1Body.nextCursor },
      }
    ))
    expect(page2.statusCode).toBe(200)
    const p2Body = JSON.parse(page2.body)
    expect(p2Body.items).toHaveLength(2)
    expect(p2Body.nextCursor).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Reactions
// ═══════════════════════════════════════════════════════════════════════════════

describe('PUT /artworks/{artworkId}/reactions', () => {
  it('stores a reaction and increments reactionCounts on artwork', async () => {
    await seedArtwork(ARTWORK_ID, ARTWORK_AUTHOR)

    const res = await callHandler(makeEvent(
      'PUT', `/artworks/${ARTWORK_ID}/reactions`,
      {
        userId:         VIEWER_A,
        body:           { reactionType: 'LOVE' },
        pathParameters: { artworkId: ARTWORK_ID },
      }
    ))
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).reactionType).toBe('LOVE')

    const meta = await getArtworkMeta()
    expect(meta.Item?.reactionCounts?.LOVE).toBe(1)
  })

  it('is idempotent when the same reactionType is sent twice', async () => {
    await seedArtwork(ARTWORK_ID, ARTWORK_AUTHOR)

    await callHandler(makeEvent(
      'PUT', `/artworks/${ARTWORK_ID}/reactions`,
      { userId: VIEWER_A, body: { reactionType: 'WOW' }, pathParameters: { artworkId: ARTWORK_ID } }
    ))
    await callHandler(makeEvent(
      'PUT', `/artworks/${ARTWORK_ID}/reactions`,
      { userId: VIEWER_A, body: { reactionType: 'WOW' }, pathParameters: { artworkId: ARTWORK_ID } }
    ))

    const meta = await getArtworkMeta()
    expect(meta.Item?.reactionCounts?.WOW).toBe(1)
  })

  it('changes reaction type: decrements old, increments new', async () => {
    await seedArtwork(ARTWORK_ID, ARTWORK_AUTHOR)

    await callHandler(makeEvent(
      'PUT', `/artworks/${ARTWORK_ID}/reactions`,
      { userId: VIEWER_A, body: { reactionType: 'LOVE' }, pathParameters: { artworkId: ARTWORK_ID } }
    ))
    const change = await callHandler(makeEvent(
      'PUT', `/artworks/${ARTWORK_ID}/reactions`,
      { userId: VIEWER_A, body: { reactionType: 'FIRE' }, pathParameters: { artworkId: ARTWORK_ID } }
    ))
    expect(change.statusCode).toBe(200)
    expect(JSON.parse(change.body).reactionType).toBe('FIRE')

    const meta = await getArtworkMeta()
    expect(meta.Item?.reactionCounts?.FIRE).toBe(1)
    expect(meta.Item?.reactionCounts?.LOVE ?? 0).toBe(0)
  })

  it('returns 400 for an invalid reactionType', async () => {
    await seedArtwork(ARTWORK_ID, ARTWORK_AUTHOR)

    const res = await callHandler(makeEvent(
      'PUT', `/artworks/${ARTWORK_ID}/reactions`,
      {
        userId:         VIEWER_A,
        body:           { reactionType: 'THUMBSUP' },
        pathParameters: { artworkId: ARTWORK_ID },
      }
    ))
    expect(res.statusCode).toBe(400)
  })
})

describe('DELETE /artworks/{artworkId}/reactions', () => {
  it('removes a reaction and decrements reactionCounts', async () => {
    await seedArtwork(ARTWORK_ID, ARTWORK_AUTHOR)

    await callHandler(makeEvent(
      'PUT', `/artworks/${ARTWORK_ID}/reactions`,
      { userId: VIEWER_A, body: { reactionType: 'INSPIRED' }, pathParameters: { artworkId: ARTWORK_ID } }
    ))

    const del = await callHandler(makeEvent(
      'DELETE', `/artworks/${ARTWORK_ID}/reactions`,
      { userId: VIEWER_A, pathParameters: { artworkId: ARTWORK_ID } }
    ))
    expect(del.statusCode).toBe(204)

    const meta = await getArtworkMeta()
    expect(meta.Item?.reactionCounts?.INSPIRED ?? 0).toBe(0)
  })

  it('returns 204 no-op when the user has no reaction to delete', async () => {
    await seedArtwork(ARTWORK_ID, ARTWORK_AUTHOR)

    const res = await callHandler(makeEvent(
      'DELETE', `/artworks/${ARTWORK_ID}/reactions`,
      { userId: VIEWER_A, pathParameters: { artworkId: ARTWORK_ID } }
    ))
    expect(res.statusCode).toBe(204)
  })
})
