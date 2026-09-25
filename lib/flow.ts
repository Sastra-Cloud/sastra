export const MIN_ACTIVE_PROJECT_COORDINATION_LIMIT = 5;
export const ACTIVE_PROJECTS_PER_TEAM_MEMBER = 1.5;
export const PERSON_OPEN_TASK_LIMIT = 5;
export const REVIEW_SLA_DAYS = 3;

export const TASK_WIP_LIMITS: Partial<Record<string, number>> = {
  in_progress: 3,
  review: 3,
};

export function activeProjectCoordinationLimit(teamSize: number): number {
  const normalizedTeamSize = Number.isFinite(teamSize)
    ? Math.max(0, Math.floor(teamSize))
    : 0;
  return Math.max(
    MIN_ACTIVE_PROJECT_COORDINATION_LIMIT,
    Math.ceil(normalizedTeamSize * ACTIVE_PROJECTS_PER_TEAM_MEMBER)
  );
}

export function daysSince(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const diff = Date.now() - date.getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

export function reviewAgeDays(
  status: string,
  updatedAt: Date | string | null | undefined
): number | null {
  if (status !== "review") return null;
  return daysSince(updatedAt);
}

export function isReviewStale(
  status: string,
  updatedAt: Date | string | null | undefined
): boolean {
  const age = reviewAgeDays(status, updatedAt);
  return age !== null && age >= REVIEW_SLA_DAYS;
}
