// =============================================================================
// lambdas/admin/src/sqs.ts
// SQS queue-depth helper for the admin dashboard (FR-ADMIN-06).
// Returns ApproximateNumberOfMessages for a given queue URL.
// Mocked in integration tests.
// =============================================================================

import { GetQueueAttributesCommand, SQSClient } from '@aws-sdk/client-sqs'

let _client: SQSClient | null = null

const getClient = (): SQSClient => {
  if (!_client) {
    _client = new SQSClient({
      region: process.env.AWS_REGION ?? 'us-east-1',
      ...(process.env.AWS_ENDPOINT_URL
        ? { endpoint: process.env.AWS_ENDPOINT_URL }
        : {}),
    })
  }
  return _client
}

/**
 * Returns the approximate number of messages in an SQS queue.
 * Returns -1 if the queue URL is missing or the call fails, so the dashboard
 * can surface "unavailable" rather than crash.
 */
export const getDlqDepth = async (queueUrl: string | undefined): Promise<number> => {
  if (!queueUrl) return -1
  try {
    const result = await getClient().send(
      new GetQueueAttributesCommand({
        QueueUrl:       queueUrl,
        AttributeNames: ['ApproximateNumberOfMessages'],
      })
    )
    return parseInt(result.Attributes?.ApproximateNumberOfMessages ?? '0', 10)
  } catch {
    return -1
  }
}
