/**
 * Pure presence derivation (no DB) so it's unit-testable. A user is "online"
 * when they've sent a recent visible heartbeat, "away" when their tab is hidden
 * or activity is stale-but-recent, and "offline" otherwise. A manual override
 * ("away"/"offline") always wins; "auto" defers to activity.
 */

export type PresenceStatus = "online" | "away" | "offline";
export type ManualStatus = "auto" | "away" | "offline";

export const ONLINE_WINDOW_MS = 75_000; // ~2 missed 30s heartbeats
export const AWAY_WINDOW_MS = 5 * 60_000;

export type PresenceInput = {
  lastActiveAt: Date | null;
  lastHiddenAt: Date | null;
  manualStatus: ManualStatus;
};

export function derivePresence(p: PresenceInput, now: Date): PresenceStatus {
  if (p.manualStatus === "offline") return "offline";
  if (p.manualStatus === "away") return "away";

  const activeAge = p.lastActiveAt
    ? now.getTime() - p.lastActiveAt.getTime()
    : Infinity;
  if (activeAge >= AWAY_WINDOW_MS) return "offline";

  const hiddenMoreRecent =
    p.lastHiddenAt != null &&
    (p.lastActiveAt == null || p.lastHiddenAt > p.lastActiveAt);
  if (hiddenMoreRecent) return "away";

  return activeAge < ONLINE_WINDOW_MS ? "online" : "away";
}
