export const CLOSED_PROJECT_STATUSES = new Set(["completed", "cancelled"]);

type ProjectVisibility = {
  status: string;
  activeReprintStatus?: string | null;
};

/**
 * A closed publication returns to the working portfolio while a reprint is in
 * progress. The publication itself stays completed; the reprint is the active
 * work.
 */
export function isCurrentProject(project: ProjectVisibility) {
  return (
    !CLOSED_PROJECT_STATUSES.has(project.status) ||
    Boolean(project.activeReprintStatus)
  );
}

export function isArchivedProject(project: ProjectVisibility) {
  return !isCurrentProject(project);
}

export function projectOptionLabel(project: {
  title: string;
  status: string;
}) {
  if (project.status === "completed") return `${project.title} (completed)`;
  if (project.status === "cancelled") return `${project.title} (cancelled)`;
  return project.title;
}
