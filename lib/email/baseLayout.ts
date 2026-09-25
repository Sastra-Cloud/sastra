export type BaseLayoutOptions = {
  preheader?: string;
  workspaceName?: string;
  unsubscribeUrl?: string;
  unsubscribeLabel?: string;
  managePreferencesUrl?: string;
  managePreferencesLabel?: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Branded, email-client-safe HTML shell shared by transactional emails. */
export function baseLayout(content: string, options: BaseLayoutOptions = {}): string {
  const year = new Date().getFullYear();
  const links = [
    options.managePreferencesUrl
      ? `<a href="${escapeHtml(options.managePreferencesUrl)}" style="color:#71717a;text-decoration:underline;">${escapeHtml(options.managePreferencesLabel ?? "Manage notification settings")}</a>`
      : null,
    options.unsubscribeUrl
      ? `<a href="${escapeHtml(options.unsubscribeUrl)}" style="color:#71717a;text-decoration:underline;">${escapeHtml(options.unsubscribeLabel ?? "Stop these emails")}</a>`
      : null,
  ].filter(Boolean);
  const footerLinks = links.length > 0 ? `${links.join(" &middot; ")}<br>` : "";
  const workspaceLine = options.workspaceName?.trim()
    ? `Sent from ${escapeHtml(options.workspaceName.trim())} through Sastra.<br>`
    : "";
  const preheader = options.preheader?.trim()
    ? `<div class="email-preheader" style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${escapeHtml(options.preheader.trim())}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <style>
    @media only screen and (max-width: 620px) {
      .email-page { padding: 16px 8px !important; }
      .email-brand { padding: 22px 22px 6px !important; }
      .email-content { padding: 8px 22px 24px !important; }
      .email-footer { padding: 16px 22px !important; }
    }
    @media (prefers-color-scheme: dark) {
      .email-body, .email-page { background: #18181b !important; }
      .email-card { background: #27272a !important; border-color: #3f3f46 !important; }
      .email-brand, .email-content, .email-content h1, .email-content h2,
      .email-content h3, .email-content p, .email-content li,
      .email-content a:not(.email-cta-link) { color: #f4f4f5 !important; }
      .email-content .email-muted { color: #d4d4d8 !important; }
      .email-content .email-divider { border-color: #3f3f46 !important; }
      .email-footer { background: #18181b !important; border-color: #3f3f46 !important; color: #d4d4d8 !important; }
      .email-footer a { color: #d4d4d8 !important; }
      .email-cta-cell { background: #f4f4f5 !important; }
      .email-cta-link { color: #18181b !important; }
    }
    @media (forced-colors: active) {
      .email-cta-cell { background: ButtonFace !important; border: 1px solid ButtonText !important; }
      .email-cta-link { color: ButtonText !important; }
    }
  </style>
</head>
<body class="email-body" style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  ${preheader}
  <table class="email-page" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;">
    <tr>
      <td align="center">
        <table class="email-card" role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e4e4e7;">
          <tr>
            <td class="email-brand" style="padding:24px 32px 8px 32px;color:#18181b;">
              <span style="font-size:18px;font-weight:700;letter-spacing:-0.01em;">Sastra</span>
            </td>
          </tr>
          <tr>
            <td class="email-content" style="padding:8px 32px 28px 32px;color:#3f3f46;font-size:16px;line-height:1.6;">
              ${content}
            </td>
          </tr>
          <tr>
            <td class="email-footer" style="padding:16px 32px;background:#fafafa;border-top:1px solid #f0f0f1;color:#71717a;font-size:13px;line-height:1.6;">
              ${footerLinks}${workspaceLine}&copy; ${year} Sastra
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** A consistent, touch-friendly primary CTA button. */
export function ctaButton(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;">
    <tr><td class="email-cta-cell" style="border-radius:10px;background:#18181b;">
      <a class="email-cta-link" href="${escapeHtml(url)}" style="display:inline-block;padding:12px 22px;min-height:20px;color:#ffffff;text-decoration:none;font-size:16px;line-height:20px;font-weight:600;">${escapeHtml(label)}</a>
    </td></tr>
  </table>`;
}
