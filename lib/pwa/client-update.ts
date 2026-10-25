import { createDeploymentGuard } from "./deployment-guard";

export const APP_UPDATE_EVENT = "sastra:app-update";
export const BEFORE_APP_REFRESH_EVENT = "sastra:before-app-refresh";

let guard: ReturnType<typeof createDeploymentGuard> | null = null;

/** Installed synchronously before hydration so early actions use the same guard. */
export function installDeploymentGuard() {
  if (guard || typeof window === "undefined") return;
  guard = createDeploymentGuard({
    fetch: window.fetch.bind(window),
    loadedVersion: process.env.NEXT_PUBLIC_SASTRA_DEPLOYMENT_ID ?? "dev",
    origin: window.location.origin,
    onUpdate: () => window.dispatchEvent(new Event(APP_UPDATE_EVENT)),
  });
  window.fetch = guard.fetch;
}

export async function checkForAppUpdate() {
  return guard?.check() ?? false;
}

/** No automatic reloads or mutation replay. Draft owners may veto a failed save. */
export function reloadForAppUpdate(): boolean {
  if (guard?.hasPendingMutations()) return false;
  if (!window.dispatchEvent(new Event(BEFORE_APP_REFRESH_EVENT, { cancelable: true }))) {
    return false;
  }
  window.location.reload();
  return true;
}
