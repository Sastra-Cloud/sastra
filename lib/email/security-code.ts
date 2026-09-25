import "server-only";

import { baseLayout } from "./baseLayout";
import { escapeHtml } from "./renderTemplate";
import { from } from "./transport";
import { sendMail } from "./send";
import { getWorkspaceSettings } from "@/lib/workspace/queries";

export function renderSecurityCodeEmail({
  code,
  workspaceName,
}: {
  code: string;
  workspaceName?: string | null;
}) {
  const organization = workspaceName?.trim() || "your Sastra workspace";
  const subject = "Your Sastra security code";
  const content = `
    <h1 style="font-size:22px;line-height:1.3;color:#18181b;margin:8px 0 14px;">Confirm it’s you</h1>
    <p style="margin:0 0 12px;">Enter this code to access protected financial and security settings for ${escapeHtml(organization)}.</p>
    <p style="font-size:30px;font-weight:700;letter-spacing:8px;margin:18px 0;color:#18181b;">${escapeHtml(code)}</p>
    <p style="margin:0;color:#52525b;font-size:14px;">The code expires in 10 minutes. If you didn’t request it, sign out of other sessions and contact your workspace administrator.</p>
  `;
  return {
    subject,
    html: baseLayout(content, {
      preheader: "Your one-time Sastra security code expires in 10 minutes.",
      workspaceName: organization,
    }),
    text: [
      subject,
      `Use this code for ${organization}: ${code}`,
      "It expires in 10 minutes.",
      "If you didn’t request it, sign out of other sessions and contact your workspace administrator.",
    ].join("\n\n"),
  };
}

export async function sendSecurityCodeEmail({
  to,
  code,
}: {
  to: string;
  code: string;
}) {
  const workspace = await getWorkspaceSettings();
  await sendMail({
    from,
    to,
    ...renderSecurityCodeEmail({
      code,
      workspaceName: workspace.orgName,
    }),
  });
}
