import "server-only";

import { appHostname } from "@/lib/app-hostname";

import { baseLayout, ctaButton } from "./baseLayout";
import { appUrl, from } from "./transport";
import { sendMail } from "./send";
import { escapeHtml } from "./renderTemplate";
import { notificationAction, notificationSubject } from "./notification-presentation";
import { getWorkspaceSettings } from "@/lib/workspace/queries";
import type {
  EmailDeliveryMode,
  NotificationEmailCategory,
} from "@/lib/notifications/email-policy";

export const MAX_NOTIFICATION_EMAIL_ITEMS = 50;

export type NotificationEmailItem = {
  queueId: string;
  category: NotificationEmailCategory;
  type: string;
  title: string;
  body: string | null;
  project: string | null;
  link: string | null;
  createdAt: Date;
};

function absoluteUrl(path: string | null): string {
  return notificationAction(path, "").url;
}

function digestSubject(items: readonly NotificationEmailItem[], mode: EmailDeliveryMode, workspaceName?: string | null) {
  if (items.length === 1) return notificationSubject(items[0].title, items[0].project);
  const workspace = workspaceName?.trim();
  if (workspace) return mode === "daily" ? `${workspace} · Daily digest: ${items.length} updates` : `${workspace} · ${items.length} new updates`;
  if (mode === "daily") return `Your Sastra digest: ${items.length} updates`;
  return `${items.length} new Sastra updates`;
}

type SummaryKind =
  | "overdue"
  | "assignment"
  | "ready"
  | "dueDate"
  | "budget"
  | "invoice"
  | "mention"
  | "reply"
  | "standup"
  | "update";

function summaryKind(type: string): SummaryKind {
  if (type === "task_overdue") return "overdue";
  if (type === "task_assigned") return "assignment";
  if (type === "task_ready") return "ready";
  if (type === "task_due_date_changed") return "dueDate";
  if (type.startsWith("budget_")) return "budget";
  if (type.includes("invoice")) return "invoice";
  if (type.includes("mention")) return "mention";
  if (type.includes("reply")) return "reply";
  if (type === "standup_digest") return "standup";
  return "update";
}

const SUMMARY_COPY: Record<SummaryKind, [string, string]> = {
  overdue: ["overdue task", "overdue tasks"],
  assignment: ["assignment", "assignments"],
  ready: ["ready task", "ready tasks"],
  dueDate: ["due date change", "due date changes"],
  budget: ["budget update", "budget updates"],
  invoice: ["invoice update", "invoice updates"],
  mention: ["mention", "mentions"],
  reply: ["reply", "replies"],
  standup: ["standup summary", "standup summaries"],
  update: ["other update", "other updates"],
};

export function notificationPreheader(items: readonly NotificationEmailItem[]) {
  const counts = new Map<SummaryKind, number>();
  for (const item of items) {
    const kind = summaryKind(item.type);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  const order: SummaryKind[] = [
    "overdue",
    "assignment",
    "ready",
    "dueDate",
    "budget",
    "invoice",
    "mention",
    "reply",
    "standup",
    "update",
  ];
  return order
    .filter((kind) => counts.has(kind))
    .map((kind) => {
      const count = counts.get(kind)!;
      return `${count} ${SUMMARY_COPY[kind][count === 1 ? 0 : 1]}`;
    })
    .join(" · ");
}

type DigestGroup = {
  heading: string;
  items: NotificationEmailItem[];
};

function groupedItems(sorted: readonly NotificationEmailItem[]): DigestGroup[] {
  const projectGroups = new Map<string, NotificationEmailItem[]>();
  const workspace: NotificationEmailItem[] = [];
  const standups: NotificationEmailItem[] = [];

  for (const item of sorted) {
    if (item.category === "standup") {
      standups.push(item);
    } else if (item.project) {
      projectGroups.set(item.project, [...(projectGroups.get(item.project) ?? []), item]);
    } else {
      workspace.push(item);
    }
  }

  return [
    ...[...projectGroups.entries()].map(([heading, items]) => ({ heading, items })),
    ...(workspace.length ? [{ heading: "Workspace", items: workspace }] : []),
    ...(standups.length ? [{ heading: "Standups", items: standups }] : []),
  ];
}

function unsubscribeCopy(category: NotificationEmailCategory | "all") {
  if (category === "workflow") return "Stop workflow emails";
  if (category === "standup") return "Stop standup emails";
  return "Stop notification emails";
}

export function renderNotificationEmail({
  items,
  mode,
  unsubscribeToken,
  workspaceName,
}: {
  items: readonly NotificationEmailItem[];
  mode: EmailDeliveryMode;
  unsubscribeToken: string;
  workspaceName?: string | null;
}) {
  const sorted = [...items].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
  const detailed = sorted.slice(0, MAX_NOTIFICATION_EMAIL_ITEMS);
  const remainder = Math.max(0, sorted.length - detailed.length);
  const categories = new Set(sorted.map((item) => item.category));
  const unsubscribeCategory: NotificationEmailCategory | "all" =
    categories.size === 1
      ? (categories.values().next().value ?? "workflow")
      : "all";
  const unsubscribeUrl = `${appUrl}/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}&category=${unsubscribeCategory}`;
  const oneClickUrl = `${appUrl}/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}&category=${unsubscribeCategory}`;
  const preferencesUrl = `${appUrl}/settings/notifications`;
  const notificationsUrl = `${appUrl}/notifications`;
  const subject = digestSubject(sorted, mode, workspaceName);
  const single = sorted.length === 1;
  const singleItem = single ? detailed[0] : undefined;
  const preheader = singleItem
    ? [singleItem.project, singleItem.body || singleItem.title].filter(Boolean).join(" · ")
    : notificationPreheader(sorted);
  const groups = groupedItems(detailed);

  const sections = groups
    .map((group) => {
      const rows = group.items
        .map((item) => `<li class="email-divider" style="margin:0 0 14px;padding:0 0 14px 2px;border-bottom:1px solid #e4e4e7;">
          <a href="${escapeHtml(absoluteUrl(item.link))}" style="color:#18181b;font-weight:650;text-decoration:underline;text-decoration-color:#d4d4d8;text-underline-offset:3px;">${escapeHtml(item.title)}</a>
          ${item.body ? `<p class="email-muted" style="margin:4px 0 0;color:#52525b;">${escapeHtml(item.body)}</p>` : ""}
        </li>`)
        .join("");
      return `<section>
        <h2 style="font-size:17px;line-height:1.4;color:#18181b;margin:24px 0 10px;">${escapeHtml(group.heading)}</h2>
        <ul style="margin:0;padding:0 0 0 20px;">${rows}</ul>
      </section>`;
    })
    .join("");

  const detailHtml = single && singleItem
    ? `${singleItem.project ? `<p class="email-muted" style="margin:0 0 4px;color:#52525b;font-size:14px;">${escapeHtml(singleItem.project)}</p>` : ""}
       ${singleItem.body ? `<p style="margin:0;">${escapeHtml(singleItem.body)}</p>` : ""}`
    : sections;
  const remainderHtml = remainder > 0
    ? `<p class="email-muted" style="margin:18px 0 0;color:#52525b;">Plus ${remainder} more. View all notifications for the full list.</p>`
    : "";
  const action = singleItem ? notificationAction(singleItem.link, singleItem.type) : { label: "View all notifications", url: notificationsUrl };
  const content = `
    <h1 style="font-size:22px;line-height:1.3;color:#18181b;margin:8px 0 10px;">${escapeHtml(singleItem?.title ?? subject)}</h1>
    ${detailHtml}
    ${remainderHtml}
    ${ctaButton(action.label, action.url)}
  `;
  const html = baseLayout(content, {
    preheader,
    workspaceName: workspaceName?.trim() || undefined,
    unsubscribeUrl,
    unsubscribeLabel: unsubscribeCopy(unsubscribeCategory),
    managePreferencesUrl: preferencesUrl,
    managePreferencesLabel: "Manage notification settings",
  });

  const textDetails = single && singleItem
    ? [singleItem.project, singleItem.body, absoluteUrl(singleItem.link)]
        .filter(Boolean)
        .join("\n")
    : groups
        .map((group) => [
          group.heading.toUpperCase(),
          ...group.items.map((item) => [
            `- ${item.title}${item.body ? ` — ${item.body}` : ""}`,
            `  ${absoluteUrl(item.link)}`,
          ].join("\n")),
        ].join("\n"))
        .join("\n\n");
  const text = [
    workspaceName?.trim(),
    subject,
    textDetails,
    remainder > 0 ? `Plus ${remainder} more: ${notificationsUrl}` : "",
    `${action.label}: ${action.url}`,
    `Manage notification settings: ${preferencesUrl}`,
    `${unsubscribeCopy(unsubscribeCategory)}: ${unsubscribeUrl}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    subject,
    preheader,
    html,
    text,
    oneClickUrl,
    unsubscribeCategory,
    detailedCount: detailed.length,
    remainder,
  };
}

export async function sendNotificationEmail({
  to,
  items,
  mode,
  unsubscribeToken,
  batchId,
}: {
  to: string;
  items: readonly NotificationEmailItem[];
  mode: EmailDeliveryMode;
  unsubscribeToken: string;
  batchId: string;
}) {
  const workspace = await getWorkspaceSettings();
  const rendered = renderNotificationEmail({ items, mode, unsubscribeToken, workspaceName: workspace.orgName });
  const hostname = appHostname();
  const safeBatchId = batchId.replace(/[^a-zA-Z0-9_.-]/g, "-");
  await sendMail({
    from,
    to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    messageId: `<notification-${safeBatchId}@${hostname}>`,
    headers: {
      "List-Unsubscribe": `<${rendered.oneClickUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
}
