export const PULL_REFRESH_THRESHOLD = 68;
export const PULL_REFRESH_MAX_DISTANCE = 92;

/** Apply resistance so a long finger drag stays compact and intentional. */
export function resistedPullDistance(deltaY: number): number {
  if (!Number.isFinite(deltaY) || deltaY <= 0) return 0;
  return Math.min(PULL_REFRESH_MAX_DISTANCE, Math.round(deltaY * 0.42));
}

export function shouldRefreshAfterPull(distance: number): boolean {
  return distance >= PULL_REFRESH_THRESHOLD;
}
