// =============================================================================
// lambdas/notifications/src/email-template.ts
// Builds HTML + plain-text notification email — FR-NOTIF-04, §4.6
// Pure function — no I/O.
// =============================================================================

export type BuildEmailBodyOpts = {
  viewerDisplayName:  string
  authorDisplayName:  string
  pieceTitle:         string
  descriptionExcerpt: string   // caller trims to ≤160 chars
  pieceUrl:           string
  unsubscribeUrl:     string
  thumbnailUrl:       string | null   // null for PRIVATE pieces
  isPrivate:          boolean
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const buildEmailBody = (opts: BuildEmailBodyOpts): { html: string; text: string } => {
  const {
    viewerDisplayName,
    authorDisplayName,
    pieceTitle,
    descriptionExcerpt,
    pieceUrl,
    unsubscribeUrl,
    thumbnailUrl,
    isPrivate,
  } = opts

  const label = isPrivate ? 'exclusive' : 'public'

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New ${escapeHtml(label)} piece by ${escapeHtml(authorDisplayName)}</title>
</head>
<body style="margin:0;padding:0;background-color:#0e0d0b;font-family:'DM Sans',Arial,sans-serif;color:#f5f0e8;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation"
               style="max-width:600px;background-color:#1c1a16;border:1px solid rgba(200,151,58,0.2);border-radius:4px;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 24px;border-bottom:1px solid rgba(200,151,58,0.1);">
              <span style="font-size:10px;font-weight:500;letter-spacing:0.2em;text-transform:uppercase;color:#c8973a;">Duseum</span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              <p style="margin:0 0 8px;font-size:11px;font-weight:500;letter-spacing:0.18em;text-transform:uppercase;color:#c8973a;">
                New ${escapeHtml(label)} piece
              </p>
              <h1 style="margin:0 0 4px;font-size:22px;font-weight:400;color:#fdfaf4;line-height:1.2;">
                ${escapeHtml(pieceTitle)}
              </h1>
              <p style="margin:0 0 24px;font-size:13px;font-weight:300;color:#7a7068;">
                by ${escapeHtml(authorDisplayName)}
              </p>

              ${thumbnailUrl ? `
              <div style="margin-bottom:24px;border:1px solid rgba(200,151,58,0.12);border-radius:2px;overflow:hidden;">
                <img src="${escapeHtml(thumbnailUrl)}" alt="${escapeHtml(pieceTitle)}"
                     style="display:block;width:100%;max-height:340px;object-fit:cover;" />
              </div>` : ''}

              ${descriptionExcerpt ? `
              <p style="margin:0 0 28px;font-size:14px;font-weight:300;color:#ede7d9;line-height:1.7;">
                ${escapeHtml(descriptionExcerpt)}
              </p>` : ''}

              <a href="${escapeHtml(pieceUrl)}"
                 style="display:inline-block;background-color:#c8973a;color:#0e0d0b;font-size:12px;font-weight:500;letter-spacing:0.06em;text-transform:uppercase;text-decoration:none;padding:14px 32px;border-radius:2px;">
                View piece
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid rgba(200,151,58,0.1);">
              <p style="margin:0;font-size:11px;font-weight:300;color:#7a7068;line-height:1.6;">
                You're receiving this because you follow ${escapeHtml(authorDisplayName)} on Duseum.
                <br />
                <a href="${escapeHtml(unsubscribeUrl)}"
                   style="color:#c8973a;text-decoration:underline;">
                  Unsubscribe from ${escapeHtml(authorDisplayName)}'s notifications
                </a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const text = [
    `New ${label} piece by ${authorDisplayName}`,
    '',
    pieceTitle,
    `by ${authorDisplayName}`,
    '',
    descriptionExcerpt,
    '',
    `View piece: ${pieceUrl}`,
    '',
    `---`,
    `You're receiving this because you follow ${authorDisplayName} on Duseum.`,
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join('\n')

  return { html, text }
}

/** Trims excerpt to ≤160 chars at a word boundary. */
export const trimExcerpt = (text: string, maxLen = 160): string => {
  if (text.length <= maxLen) return text
  const cut = text.slice(0, maxLen)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut) + '…'
}
