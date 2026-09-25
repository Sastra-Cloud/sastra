/**
 * Pure helpers for the many-to-many link between a captured email thread and the
 * projects it concerns. `emailThreads.projectId` is kept as a backward-compatible
 * "primary" link that mirrors the oldest surviving link in `email_thread_projects`.
 * Kept dependency-free so it can be unit tested without a database.
 */

/**
 * Decide the thread's primary project after a link is removed.
 *
 * - Removing a non-primary link leaves the primary untouched.
 * - Removing the primary promotes the oldest remaining link (callers pass
 *   `remainingLinkedIds` oldest-first), or clears the primary when none remain.
 */
export function nextPrimaryProjectId(
  currentPrimary: string | null,
  removedProjectId: string,
  remainingLinkedIds: string[]
): string | null {
  if (currentPrimary !== removedProjectId) return currentPrimary;
  return remainingLinkedIds[0] ?? null;
}
