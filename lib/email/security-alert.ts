import "server-only";

import { baseLayout, ctaButton } from "./baseLayout";
import { escapeHtml } from "./renderTemplate";
import { appUrl, from } from "./transport";
import { sendMail } from "./send";
import { getWorkspaceSettings } from "@/lib/workspace/queries";
import { DATABASE_TLS_ADVICE } from "@/lib/security/database-transport-rules";

export type SecurityAlertKind = "failed" | "stale" | "database_tls";

export function renderSecurityAlertEmail({
  kind,
  workspaceName,
}: {
  kind: SecurityAlertKind;
  workspaceName?: string | null;
}) {
  const organization = workspaceName?.trim() || "your Sastra workspace";
  const failed = kind === "failed";
  const databaseTls = kind === "database_tls";
  const subject = databaseTls
    ? "Sastra database connection is not encrypted"
    : failed
      ? "Sastra dependency security check failed"
      : "Sastra dependency security check is overdue";
  const summary = databaseTls
    ? "Sastra detected that its production PostgreSQL connection is not using TLS."
    : failed
      ? "The daily production dependency audit found at least one high-severity security advisory."
      : "Sastra has not received a successful daily dependency security report within the expected window.";
  const nextStep = databaseTls
    ? DATABASE_TLS_ADVICE
    : failed
      ? "Open the GitHub Actions run, review the advisory, and apply the smallest safe dependency update."
      : "Check the scheduled GitHub Action and its Sastra webhook configuration.";

  return {
    subject,
    html: baseLayout(
      `
        <h1 style="font-size:22px;line-height:1.3;color:#18181b;margin:8px 0 14px;">Security attention needed</h1>
        <p style="margin:0 0 12px;">${escapeHtml(summary)}</p>
        <p style="margin:0 0 12px;">${escapeHtml(nextStep)}</p>
        ${ctaButton("View security status", `${appUrl}/settings/security`)}
        <p class="email-muted" style="margin:0;color:#52525b;font-size:14px;">This operational alert is sent only to active super administrators.</p>
      `,
      {
        preheader: summary,
        workspaceName: organization,
      }
    ),
    text: [
      subject,
      summary,
      nextStep,
      `View security status: ${appUrl}/settings/security`,
      "This operational alert is sent only to active super administrators.",
    ].join("\n\n"),
  };
}

export async function sendSecurityAlertEmail({
  to,
  kind,
}: {
  to: string;
  kind: SecurityAlertKind;
}) {
  const workspace = await getWorkspaceSettings();
  await sendMail({
    from,
    to,
    ...renderSecurityAlertEmail({
      kind,
      workspaceName: workspace.orgName,
    }),
  });
}
