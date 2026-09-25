import "server-only";

import { baseLayout, ctaButton } from "./baseLayout";
import { escapeHtml } from "./renderTemplate";
import { from } from "./transport";
import { sendMail } from "./send";
import { getWorkspaceSettings } from "@/lib/workspace/queries";

function workspaceLabel(value?: string | null) {
  return value?.trim() || "your Sastra workspace";
}

export function renderInviteEmail({
  inviteUrl,
  role,
  invitedByName,
  workspaceName,
}: {
  inviteUrl: string;
  role: string;
  invitedByName?: string | null;
  workspaceName?: string | null;
}) {
  const organization = workspaceLabel(workspaceName);
  const inviter = invitedByName?.trim() || null;
  const roleLabel = role === "super_admin" ? "super admin" : role;
  const subject = inviter
    ? `${inviter} invited you to ${organization}`
    : `You’re invited to ${organization}`;
  const invitationLine = inviter
    ? `${escapeHtml(inviter)} invited you to join <strong>${escapeHtml(organization)}</strong> as <strong>${escapeHtml(roleLabel)}</strong>.`
    : `You’ve been invited to join <strong>${escapeHtml(organization)}</strong> as <strong>${escapeHtml(roleLabel)}</strong>.`;
  const content = `
    <h1 style="font-size:22px;line-height:1.3;color:#18181b;margin:8px 0 14px;">Join ${escapeHtml(organization)}</h1>
    <p style="margin:0 0 10px;">${invitationLine}</p>
    <p style="margin:0 0 10px;">You’ll set up your account and work with the team in Sastra. This invitation expires in seven days.</p>
    ${ctaButton("Accept invitation", inviteUrl)}
    <p class="email-muted" style="margin:0 0 10px;color:#52525b;font-size:14px;">If you weren’t expecting this invitation, you can ignore this email.</p>
    <p class="email-muted" style="margin:0;color:#52525b;font-size:14px;overflow-wrap:anywhere;">If the button doesn’t work, open this link:<br><a href="${escapeHtml(inviteUrl)}" style="color:#3f3f46;text-decoration:underline;">${escapeHtml(inviteUrl)}</a></p>
  `;
  const html = baseLayout(content, {
    preheader: `${inviter ?? "A teammate"} invited you to join ${organization} in Sastra.`,
    workspaceName: organization,
  });
  const text = [
    `Join ${organization}`,
    inviter
      ? `${inviter} invited you to join ${organization} as ${roleLabel}.`
      : `You’ve been invited to join ${organization} as ${roleLabel}.`,
    "You’ll set up your account and work with the team in Sastra. This invitation expires in seven days.",
    `Accept invitation: ${inviteUrl}`,
    "If you weren’t expecting this invitation, you can ignore this email.",
  ].join("\n\n");
  return { subject, html, text };
}

export async function sendInviteEmail({
  to,
  inviteUrl,
  role,
  invitedByName,
  workspaceName,
}: {
  to: string;
  inviteUrl: string;
  role: string;
  invitedByName?: string;
  workspaceName?: string | null;
}) {
  const resolvedWorkspace = workspaceName ?? (await getWorkspaceSettings()).orgName;
  const rendered = renderInviteEmail({
    inviteUrl,
    role,
    invitedByName,
    workspaceName: resolvedWorkspace,
  });
  await sendMail({ from, to, ...rendered });
}
