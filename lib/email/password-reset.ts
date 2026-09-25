import "server-only";

import { baseLayout, ctaButton } from "./baseLayout";
import { escapeHtml } from "./renderTemplate";
import { from } from "./transport";
import { sendMail } from "./send";
import { getWorkspaceSettings } from "@/lib/workspace/queries";

export function renderPasswordResetEmail({
  url,
  workspaceName,
}: {
  url: string;
  workspaceName?: string | null;
}) {
  const organization = workspaceName?.trim() || "your Sastra workspace";
  const subject = "Reset your Sastra password";
  const content = `
    <h1 style="font-size:22px;line-height:1.3;color:#18181b;margin:8px 0 14px;">Reset your Sastra password</h1>
    <p style="margin:0 0 10px;">Use this link to reset the password you use for ${escapeHtml(organization)}.</p>
    <p style="margin:0;">This link expires in one hour.</p>
    ${ctaButton("Reset password", url)}
    <p class="email-muted" style="margin:0 0 10px;color:#52525b;font-size:14px;">If you didn’t request a password reset, you can ignore this email.</p>
    <p class="email-muted" style="margin:0;color:#52525b;font-size:14px;overflow-wrap:anywhere;">If the button doesn’t work, open this link:<br><a href="${escapeHtml(url)}" style="color:#3f3f46;text-decoration:underline;">${escapeHtml(url)}</a></p>
  `;
  return {
    subject,
    html: baseLayout(content, {
      preheader: "Your Sastra password-reset link expires in one hour.",
      workspaceName: organization,
    }),
    text: [
      subject,
      `Use this link to reset the password you use for ${organization}.`,
      "This link expires in one hour.",
      `Reset password: ${url}`,
      "If you didn’t request a password reset, you can ignore this email.",
    ].join("\n\n"),
  };
}

export async function sendPasswordResetEmail({ to, url }: { to: string; url: string }) {
  const workspace = await getWorkspaceSettings();
  await sendMail({
    from,
    to,
    ...renderPasswordResetEmail({ url, workspaceName: workspace.orgName }),
  });
}
