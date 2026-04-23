// =============================================================================
// lambdas/notifications/src/fan-out.ts
// Core fan-out logic for NEW_PIECE_PUBLISHED messages — §4.6, FR-NOTIF-01–12
//
// Separated from index.ts so integration tests can call it directly without
// the SQS wrapper.
// =============================================================================

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import { Logger } from '@aws-lambda-powertools/logger'
import { UpdateCommand } from '@aws-sdk/lib-dynamodb'
import {
  docClient,
  getArtPiece,
  getAuthorProfile,
  getUserAccount,
  getViewerProfile,
  getPreference,
  listFollowersByAuthor,
  listAuthorSubscribersByAuthor,
  resolveNotificationPref,
  getSesFromAddress,
  generateUnsubscribeToken,
  TABLE_NAME,
} from '@duseum/shared'
import { buildEmailBody, trimExcerpt } from './email-template.js'

const logger = new Logger({ serviceName: 'notifications-lambda' })

// SES client singleton
let _ses: SESClient | null = null
const getSes = (): SESClient => {
  if (!_ses) {
    _ses = new SESClient({
      region: process.env.AWS_REGION ?? 'us-east-1',
      ...(process.env.AWS_ENDPOINT_URL ? { endpoint: process.env.AWS_ENDPOINT_URL } : {}),
    })
  }
  return _ses
}

// ── Message type ──────────────────────────────────────────────────────────────

export type NewPiecePublishedMessage = {
  eventType:          'NEW_PIECE_PUBLISHED'
  artworkId:          string
  authorId:           string
  visibility:         'PUBLIC' | 'PRIVATE'
  title:              string
  descriptionExcerpt: string
  thumbnailS3Key:     string
  publishedAt:        string
}

// ── Concurrency helpers ───────────────────────────────────────────────────────

/** Run an array of tasks with at most `concurrency` in-flight at once. */
async function pLimit<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number
): Promise<T[]> {
  const results: T[] = []
  let index = 0
  const run = async (): Promise<void> => {
    while (index < tasks.length) {
      const i = index++
      results[i] = await tasks[i]!()
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, run))
  return results
}

// ── Recipient collection (exhaustive pagination) ──────────────────────────────

async function collectRecipientIds(
  authorId: string,
  visibility: 'PUBLIC' | 'PRIVATE'
): Promise<string[]> {
  const ids: string[] = []

  if (visibility === 'PUBLIC') {
    let lastKey: Record<string, unknown> | undefined
    do {
      const { items, lastKey: nextKey } = await listFollowersByAuthor(docClient, {
        authorId,
        limit: 500,
        lastKey,
      })
      for (const f of items) ids.push(f.viewerId)
      lastKey = nextKey
    } while (lastKey)
  } else {
    let lastKey: Record<string, unknown> | undefined
    do {
      const { items, lastKey: nextKey } = await listAuthorSubscribersByAuthor(
        docClient, authorId, lastKey
      )
      for (const sub of items) ids.push(sub.userId)
      lastKey = nextKey
    } while (lastKey)
  }

  // Deduplicate (safety net for concurrent write races)
  return [...new Set(ids)]
}

// ── Main fan-out entry point ──────────────────────────────────────────────────

export async function fanOut(message: NewPiecePublishedMessage): Promise<void> {
  const { artworkId, authorId, visibility, title, descriptionExcerpt, thumbnailS3Key } = message

  // Step 1 — Load + verify
  const [artwork, author] = await Promise.all([
    getArtPiece(docClient, artworkId),
    getAuthorProfile(docClient, authorId),
  ])

  if (!artwork) {
    logger.warn('artwork not found, skipping fan-out', { artworkId })
    return
  }
  if (artwork.visibility === 'DRAFT' || artwork.status === 'ARCHIVED') {
    logger.warn('artwork not published, skipping fan-out', { artworkId, status: artwork.status })
    return
  }
  if (!author) {
    logger.warn('author not found, skipping fan-out', { authorId })
    return
  }
  if (author.status !== 'ACTIVE') {
    logger.warn('author not active, skipping fan-out', { authorId, status: author.status })
    return
  }

  // Step 2 — Collect recipient IDs
  const recipientIds = await collectRecipientIds(authorId, visibility)
  if (recipientIds.length === 0) {
    logger.info('no recipients, fan-out complete', { artworkId })
    return
  }

  // Step 3 — Resolve viewer data + apply preference filter
  type Recipient = { email: string; viewerId: string; displayName: string }
  const resolvedRecipients: Recipient[] = []

  const resolveTasks = recipientIds.map((viewerId) => async () => {
    const [account, viewerProfile, pref] = await Promise.all([
      getUserAccount(docClient, viewerId),
      getViewerProfile(docClient, viewerId),
      getPreference(docClient, viewerId, authorId),
    ])

    if (!account?.email || !viewerProfile) return

    const effective = resolveNotificationPref(viewerProfile, pref?.pref)
    if (effective === 'NONE') return
    if (effective === 'PUBLIC_ONLY' && visibility === 'PRIVATE') return

    resolvedRecipients.push({
      email:       account.email,
      viewerId,
      displayName: viewerProfile.displayName,
    })
  })

  await pLimit(resolveTasks, 10)

  if (resolvedRecipients.length === 0) {
    logger.info('all recipients filtered, fan-out complete', { artworkId })
    return
  }

  // Step 4 — Build + send emails
  const frontendDomain = process.env.FRONTEND_DOMAIN ?? 'duseum.com'
  const pieceUrl       = `https://${frontendDomain}/artworks/${artworkId}`
  const fromAddress    = await getSesFromAddress()
  const excerpt        = trimExcerpt(descriptionExcerpt, 160)

  // Thumbnail: public CloudFront URL for PUBLIC pieces; omit for PRIVATE
  const cloudfrontDomain = process.env.CLOUDFRONT_MEDIA_DOMAIN
  const thumbnailUrl =
    visibility === 'PUBLIC' && thumbnailS3Key && cloudfrontDomain
      ? `https://${cloudfrontDomain}/${thumbnailS3Key}`
      : null

  let successCount = 0

  // Send in batches of 50
  for (let i = 0; i < resolvedRecipients.length; i += 50) {
    const batch = resolvedRecipients.slice(i, i + 50)

    await Promise.all(
      batch.map(async ({ email, viewerId, displayName }) => {
        try {
          const unsubscribeToken = await generateUnsubscribeToken(viewerId, authorId)
          const unsubscribeUrl   = `https://${frontendDomain}/notifications/unsubscribe?token=${unsubscribeToken}`

          const { html, text } = buildEmailBody({
            viewerDisplayName:  displayName,
            authorDisplayName:  author.displayName,
            pieceTitle:         title,
            descriptionExcerpt: excerpt,
            pieceUrl,
            unsubscribeUrl,
            thumbnailUrl,
            isPrivate:          visibility === 'PRIVATE',
          })

          await getSes().send(new SendEmailCommand({
            Source:      fromAddress,
            Destination: { ToAddresses: [email] },
            Message: {
              Subject: {
                Data:    `New ${visibility === 'PRIVATE' ? 'exclusive' : 'public'} piece by ${author.displayName}`,
                Charset: 'UTF-8',
              },
              Body: {
                Html: { Data: html, Charset: 'UTF-8' },
                Text: { Data: text, Charset: 'UTF-8' },
              },
            },
          }))

          successCount++
        } catch (err) {
          logger.error('failed to send email', { email, artworkId, err })
          // Continue; partial failure must not re-queue the whole job
        }
      })
    )
  }

  logger.info('fan-out complete', { artworkId, successCount, total: resolvedRecipients.length })

  // Step 5 — Increment notifiedCount
  if (successCount > 0) {
    await docClient.send(new UpdateCommand({
      TableName:                 TABLE_NAME,
      Key:                       { PK: `ARTWORK#${artworkId}`, SK: 'METADATA' },
      UpdateExpression:          'ADD notifiedCount :n',
      ExpressionAttributeValues: { ':n': successCount },
    }))
  }
}
