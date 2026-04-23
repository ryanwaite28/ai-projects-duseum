// =============================================================================
// lambdas/notifications/src/index.ts
// SQS handler — wraps fanOut(); implements batch-item-failure pattern §4.6
// =============================================================================

import type { SQSEvent, SQSBatchResponse, SQSBatchItemFailure } from 'aws-lambda'
import { Logger } from '@aws-lambda-powertools/logger'
import { fanOut, type NewPiecePublishedMessage } from './fan-out.js'

const logger = new Logger({ serviceName: 'notifications-lambda' })

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const failures: SQSBatchItemFailure[] = []

  for (const record of event.Records) {
    try {
      const message = JSON.parse(record.body) as NewPiecePublishedMessage
      if (message.eventType !== 'NEW_PIECE_PUBLISHED') {
        logger.warn('unrecognised eventType, skipping', { eventType: message.eventType, messageId: record.messageId })
        continue
      }
      await fanOut(message)
    } catch (err) {
      logger.error('fan-out failed', { messageId: record.messageId, err })
      failures.push({ itemIdentifier: record.messageId })
    }
  }

  return { batchItemFailures: failures }
}
