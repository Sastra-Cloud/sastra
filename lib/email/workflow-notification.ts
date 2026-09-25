import "server-only";

import { baseLayout, ctaButton } from "./baseLayout";
import { appUrl, from } from "./transport";
import { sendMail } from "./send";
import { escapeHtml } from "./renderTemplate";
import { getWorkspaceSettings } from "@/lib/workspace/queries";

export function renderWorkflowEmail({
  title,
  body,
  project,
  url,
  actionLabel,
  unsubscribeToken,
  workspaceName,
}: {
  title: string;
  body?: string;
  project?: string;
  url: string;
  actionLabel: string;
  unsubscribeToken: string;
  workspaceName?: string | null;
}) {
  const unsubscribeUrl = `${appUrl}/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}&category=workflow`;
  const oneClickUrl = `${appUrl}/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}&category=workflow`;
  const preferencesUrl = `${appUrl}/settings/notifications`;
  const content = `
    ${project ? `<p class="email-muted" style="margin:8px 0 4px;color:#52525b;font-size:14px;">${escapeHtml(project)}</p>` : ""}
    <h1 style="font-size:22px;line-height:1.3;color:#18181b;margin:0 0 12px;">${escapeHtml(title)}</h1>
    ${body ? `<p style="margin:0 0 8px;">${escapeHtml(body)}</p>` : ""}
    ${ctaButton(actionLabel, url)}
  `;
  const text = [
    project,
    title,
    body,
    `${actionLabel}: ${url}`,
    `Manage notification settings: ${preferencesUrl}`,
    `Stop workflow emails: ${unsubscribeUrl}`,
  ].filter(Boolean).join("\n\n");
  return {
    subject: title,
    html: baseLayout(content, {
      preheader: body || [project, title].filter(Boolean).join(" · "),
      workspaceName: workspaceName?.trim() || undefined,
      unsubscribeUrl,
      unsubscribeLabel: "Stop workflow emails",
      managePreferencesUrl: preferencesUrl,
      managePreferencesLabel: "Manage notification settings",
    }),
    text,
    oneClickUrl,
  };
}

export async function sendWorkflowEmail({
  to,
  title,
  body,
  project,
  link,
  actionLabel,
  unsubscribeToken,
}: {
  to: string;
  title: string;
  body?: string;
  project?: string;
  link?: string;
  actionLabel: string;
  unsubscribeToken: string;
}) {
  const workspace = await getWorkspaceSettings();
  const rendered = renderWorkflowEmail({
    title,
    body,
    project,
    url: link ? new URL(link, appUrl).toString() : appUrl,
    actionLabel,
    unsubscribeToken,
    workspaceName: workspace.orgName,
  });
  await sendMail({
    from,
    to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    headers: {
      "List-Unsubscribe": `<${rendered.oneClickUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
}
