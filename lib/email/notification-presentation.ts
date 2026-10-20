import { appUrl } from "./transport";

/** Keep project context visible in inboxes, even before the email is opened. */
export function notificationSubject(title: string, project?: string | null): string {
  const context = project?.trim();
  return context ? `${context} · ${title}` : title;
}

/** Notification buttons lead to the work itself, with an honest fallback. */
export function notificationAction(link: string | null | undefined, type: string) {
  const fallback = { label: "View all notifications", url: new URL("/notifications", appUrl).toString() };
  if (!link?.trim()) return fallback;
  try {
    const url = new URL(link, appUrl);
    if (url.origin !== new URL(appUrl).origin || !["http:", "https:"].includes(url.protocol)) return fallback;
    const path = url.pathname;
    const label = path === "/notifications" ? fallback.label
      : path.startsWith("/agreements/") ? "View agreement"
      : /\/budget(?:\/|$)/.test(path) ? (["budget_approval_assigned", "budget_approval_reset"].includes(type) ? "Review budget" : "View budget")
      : path === "/tasks" || /\/tasks(?:\/|$)/.test(path) ? (type === "weekly_deadlines" ? "View deadlines" : url.searchParams.has("task") ? "View task" : "View tasks")
      : path.startsWith("/chat") ? "Open conversation"
      : path.startsWith("/standups") ? "View standup summary"
      : path.startsWith("/projects/") ? "View project"
      : path === "/settings/security" ? "View security status"
      : "View update";
    return { label, url: url.toString() };
  } catch {
    return fallback;
  }
}
