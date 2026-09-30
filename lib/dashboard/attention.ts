import "server-only";

import { requireRole } from "@/lib/auth/guards";
import { listUnreadNotificationsByType, notificationProject } from "@/lib/notifications/queries";
import { listManagerUpdateRecommendations } from "@/lib/projects/status-queries";
import type { listProjects } from "@/lib/projects/queries";
import { isBookProjectKind, needsPrintFundingReview } from "@/lib/projects/print-funding";
import { activeProjectCoordinationLimit } from "@/lib/flow";

export type ManagerReviewItem = {
  id: string;
  source: "project_follow_up" | "project_update" | "new_project" | "counterparty" | "dates" | "funding" | "coordination";
  title: string;
  detail: string | null;
  project: string | null;
  priority: "low" | "medium" | "high";
  href: string;
  actionLabel: string;
  createdAt: Date | null;
};

/** One complete manager queue, shared by the Home preview and Team planning. */
export async function getManagerAttention(projects: Awaited<ReturnType<typeof listProjects>>, teamSize: number): Promise<ManagerReviewItem[]> {
  const { user } = await requireRole("manager");
  const [newProjects, counterparties, updates, recommendations] = await Promise.all([
    listUnreadNotificationsByType(user.id, "possible_new_project", null),
    listUnreadNotificationsByType(user.id, "possible_counterparty", null),
    listUnreadNotificationsByType(user.id, "possible_project_update", null),
    listManagerUpdateRecommendations(null),
  ]);
  const live = projects.filter(p => ["active", "planning", "on_hold"].includes(p.status));
  const missingDates = live.filter(p => !p.dueDate);
  const funding = live.filter(p => isBookProjectKind(p.kind) && needsPrintFundingReview(p.printFundingStatus));
  const active = live.filter(p => p.status !== "on_hold");
  const items: ManagerReviewItem[] = [
    ...recommendations.map(item => ({ id: `project-update:${item.updateId}`, source: "project_follow_up" as const, title: item.analysis.recommendations[0]?.title ?? item.analysis.summary, detail: item.analysis.recommendations[0]?.reason ?? item.analysis.summary, project: item.projectTitle, priority: item.analysis.priority, href: `/projects/${item.projectSlug}#status-update`, actionLabel: "Review project", createdAt: item.createdAt })),
    ...[...newProjects, ...counterparties, ...updates].map(item => ({ id: `notification:${item.id}`, source: item.type === "possible_project_update" ? "project_update" as const : item.type === "possible_new_project" ? "new_project" as const : "counterparty" as const, title: item.title, detail: item.body, project: notificationProject(item.data), priority: "medium" as const, href: item.link ?? "/correspondence", actionLabel: "Review email", createdAt: item.createdAt })),
  ];
  if (missingDates.length) items.push({ id: "missing-dates", source: "dates", title: `${missingDates.length} ${missingDates.length === 1 ? "project needs" : "projects need"} a due date`, detail: "Set target dates for the timeline and forecast.", project: null, priority: "medium", href: "/overview/due-dates", actionLabel: "Add dates", createdAt: null });
  if (funding.length) items.push({ id: "print-funding", source: "funding", title: `${funding.length} ${funding.length === 1 ? "book needs" : "books need"} print funding review`, detail: "Review each book’s funding flag in Project settings.", project: null, priority: "medium", href: "/projects?printFunding=needs_review", actionLabel: "Review funding", createdAt: null });
  if (active.length > activeProjectCoordinationLimit(teamSize)) items.push({ id: "coordination", source: "coordination", title: "Portfolio needs a coordination pass", detail: `${active.length} active or planning projects across ${teamSize} teammates. Review assignments and team capacity.`, project: null, priority: "medium", href: "/workload", actionLabel: "Review workload", createdAt: null });
  const rank = { high: 0, medium: 1, low: 2 };
  return items.sort((a, b) => rank[a.priority] - rank[b.priority] || (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
}
