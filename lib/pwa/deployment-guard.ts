export const APP_UPDATE_MESSAGE =
  "Sastra has been updated. Refresh the app, then try again.";

export class AppUpdateRequiredError extends Error {
  constructor() {
    super(APP_UPDATE_MESSAGE);
    this.name = "AppUpdateRequiredError";
  }
}

export function isAppUpdateError(error: unknown): boolean {
  return error instanceof Error && (
    error.name === "AppUpdateRequiredError" ||
    error.name === "ChunkLoadError" ||
    /Loading chunk .+ failed|Failed to load chunk/.test(error.message) ||
    /Server Action .+ was not found on the server|Failed to find Server Action/.test(error.message)
  );
}

/** A single boundary for every client-invoked Server Action, regardless of feature. */
export function createDeploymentGuard({
  fetch: fetchOriginal,
  loadedVersion,
  origin,
  onUpdate,
}: {
  fetch: typeof globalThis.fetch;
  loadedVersion: string;
  origin: string;
  onUpdate: () => void;
}) {
  let stale = false;
  let checking: Promise<boolean> | null = null;
  let pending = 0;

  function markStale() {
    if (!stale) {
      stale = true;
      onUpdate();
    }
  }

  async function check(): Promise<boolean> {
    if (stale || !loadedVersion || loadedVersion === "dev") return stale;
    if (checking) return checking;
    checking = (async () => {
      try {
        const response = await fetchOriginal(new URL("/api/version", origin), {
          cache: "no-store",
          redirect: "error",
          // Allow hosts with deployment affinity to retain a compatible server.
          headers: { "x-deployment-id": loadedVersion },
          signal: AbortSignal.timeout(3_000),
        });
        if (response.ok) {
          const data: unknown = await response.json();
          if (data && typeof data === "object" && "id" in data &&
              typeof data.id === "string" && data.id && data.id !== "dev" &&
              data.id !== loadedVersion) markStale();
        }
      } catch {
        // A failed check does not prove skew. Preserve normal offline/error handling.
      }
      return stale;
    })();
    try {
      return await checking;
    } finally {
      checking = null;
    }
  }

  const guardedFetch: typeof globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request?.url ?? String(input), origin);
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers ?? request?.headers);
    const local = url.origin === origin;
    const action = local && method === "POST" && headers.has("Next-Action");
    const mutation = local && !["GET", "HEAD", "OPTIONS"].includes(method);
    if (mutation) pending += 1;
    try {
      // Check at the action boundary as well as on focus/poll: a timer cannot
      // protect the first click after a deployment or a suspended PWA resumes.
      if (action && await check()) throw new AppUpdateRequiredError();
      (init?.signal ?? request?.signal)?.throwIfAborted();
      const response = await fetchOriginal(input, init);
      if (action && response.headers.get("x-nextjs-action-not-found") === "1") {
        // The deployment may change between preflight and POST. Next explicitly
        // signals that this action did not run. Do not replay even this request.
        markStale();
        throw new AppUpdateRequiredError();
      }
      return response;
    } finally {
      if (mutation) pending -= 1;
    }
  };

  return { fetch: guardedFetch, check, hasPendingMutations: () => pending > 0 };
}
