export type DashboardActivityProject = {
  createdAt: string;
  updatedAt: string;
  latestInboundEmailAt: string | null;
  latestStatusUpdateAt: string | null;
};

function timestamp(value: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Keep the dashboard's newest-project baseline, but let deliberate project
 * changes, status updates, and processed linked inbound email move it ahead.
 */
export function orderProjectsByDashboardActivity<
  T extends DashboardActivityProject,
>(projects: readonly T[]): T[] {
  return projects
    .map((project, index) => ({
      project,
      index,
      activityAt: Math.max(
        timestamp(project.createdAt),
        timestamp(project.updatedAt),
        timestamp(project.latestInboundEmailAt),
        timestamp(project.latestStatusUpdateAt)
      ),
    }))
    .sort(
      (a, b) => b.activityAt - a.activityAt || a.index - b.index
    )
    .map(({ project }) => project);
}
