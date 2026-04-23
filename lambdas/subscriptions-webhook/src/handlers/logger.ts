// Shared logger instance for webhook handlers — avoids circular imports.
import { Logger } from '@aws-lambda-powertools/logger'
export const logger = new Logger({ serviceName: 'subscriptions-webhook-lambda' })
