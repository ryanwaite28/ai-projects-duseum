// =============================================================================
// packages/shared/src/sqs/index.ts
// Thin SQS send-message wrapper — Section 4.6 (notification fan-out enqueue)
//
// SQSClient singleton respects AWS_ENDPOINT_URL for MiniStack local dev.
// =============================================================================

import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'

let _sqsClient: SQSClient | null = null

const getSqsClient = (): SQSClient => {
  if (!_sqsClient) {
    _sqsClient = new SQSClient({
      region: process.env.AWS_REGION ?? 'us-east-1',
      ...(process.env.AWS_ENDPOINT_URL
        ? { endpoint: process.env.AWS_ENDPOINT_URL }
        : {}),
    })
  }
  return _sqsClient
}

/**
 * Sends a JSON-serialised message to an SQS queue.
 * The caller is responsible for not awaiting this when fire-and-forget
 * semantics are needed (use `void sendMessage(...).catch(logger.error)`).
 */
export const sendMessage = async (
  queueUrl: string,
  body: Record<string, unknown>
): Promise<void> => {
  await getSqsClient().send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(body),
    })
  )
}
