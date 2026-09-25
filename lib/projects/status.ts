export const PROJECT_STATUSES = [
  "proposal",
  "planning",
  "active",
  "on_hold",
  "completed",
  "cancelled",
] as const;

export const PROJECT_OPEN_STATUSES = [
  "proposal",
  "planning",
  "active",
  "on_hold",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type ProjectOpenStatus = (typeof PROJECT_OPEN_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  proposal: "Proposal",
  planning: "Planning",
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function isClosedProjectStatus(status: string) {
  return status === "completed" || status === "cancelled";
}
