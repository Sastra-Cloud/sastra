import "server-only";

import { baseLayout, ctaButton } from "./baseLayout";
import { escapeHtml } from "./renderTemplate";
import { from } from "./transport";
import { sendMail } from "./send";
import { getWorkspaceSettings } from "@/lib/workspace/queries";

export function renderMagicLinkEmail({
  url,
  workspaceName,
}: {
  url: string;
  workspaceName?: string | null;
}) {
  const organization = workspaceName?.trim() || "your Sastra workspace";
  const subject = "Sign in to Sastra";
  const content = `
    <h1 style="font-size:22px;line-height:1.3;color:#18181b;margin:8px 0 14px;">Sign in to Sastra</h1>
    <p style="margin:0 0 10px;">Use this link to sign in to ${escapeHtml(organization)}.</p>
    <p style="margin:0;">This link expires in 5 minutes and can be used once.</p>
    ${ctaButton("Sign in to Sastra", url)}
    <p class="email-muted" style="margin:0 0 10px;color:#52525b;font-size:14px;">If you didn’t request this link, you can ignore this email.</p>
    <p class="email-muted" style="margin:0;color:#52525b;font-size:14px;overflow-wrap:anywhere;">If the button doesn’t work, open this link:<br><a href="${escapeHtml(url)}" style="color:#3f3f46;text-decoration:underline;">${escapeHtml(url)}</a></p>
  `;
  return {
    subject,
    html: baseLayout(content, {
      preheader: "Your one-time Sastra sign-in link expires in 5 minutes.",
      workspaceName: organization,
    }),
    text: [
      subject,
      `Use this link to sign in to ${organization}.`,
      "This link expires in 5 minutes and can be used once.",
      `Sign in to Sastra: ${url}`,
      "If you didn’t request this link, you can ignore this email.",
    ].join("\n\n"),
  };
}

export async function sendMagicLinkEmail({ to, url }: { to: string; url: string }) {
  const workspace = await getWorkspaceSettings();
  await sendMail({
    from,
    to,
    ...renderMagicLinkEmail({ url, workspaceName: workspace.orgName }),
  });
}
