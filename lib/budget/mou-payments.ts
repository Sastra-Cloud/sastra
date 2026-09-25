export function allCoveredProjectsComplete(
  statuses: string[]
): boolean {
  return statuses.length === 0 || statuses.every((status) => status === "completed");
}
