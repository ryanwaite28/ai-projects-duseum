// =============================================================================
// packages/shared/src/email/ses.ts
// SES client singleton + low-level HTML email send helper.
// All transactional emails route through sendHtmlEmail().
// =============================================================================

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import { getSesFromAddress } from '../secrets.js'

let _ses: SESClient | null = null

const getClient = (): SESClient => {
  if (!_ses) {
    _ses = new SESClient({
      region: process.env.AWS_REGION ?? 'us-east-1',
      ...(process.env.AWS_ENDPOINT_URL ? { endpoint: process.env.AWS_ENDPOINT_URL } : {}),
    })
  }
  return _ses
}

export const sendHtmlEmail = async (
  to: string,
  subject: string,
  html: string
): Promise<void> => {
  const from = await getSesFromAddress()
  await getClient().send(
    new SendEmailCommand({
      Source:      from,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body:    { Html: { Data: html, Charset: 'UTF-8' } },
      },
    })
  )
}
