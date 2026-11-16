export type BellItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  project: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

/** Component-owned requests: count-only while closed, details on demand. */
export function createNotificationFeed(receive: (data: { unread: number; items?: BellItem[] }) => void,
  detailsStatus: (status: "idle" | "loading" | "error") => void = () => {}) {
  let pending: { details: boolean; controller: AbortController; promise: Promise<void> } | null = null;
  let mutations = 0;
  let active = true;
  function cancel() {
    pending?.controller.abort();
    if (pending?.details) detailsStatus("idle");
    pending = null;
  }
  function pause() {
    mutations += 1;
    cancel();
    let resumed = false;
    return () => { if (!resumed) { resumed = true; mutations -= 1; } };
  }
  function load(details: boolean, force = false): Promise<void> {
    if (!active || mutations) return Promise.resolve();
    if (!force && pending?.details === details) return pending.promise;
    cancel();
    const request = { details, controller: new AbortController(), promise: Promise.resolve() };
    pending = request;
    if (details) detailsStatus("loading");
    request.promise = (async () => {
      try {
        const response = await fetch(`/api/notifications/recent${details ? "" : "?summary=1"}`, { cache: "no-store", signal: request.controller.signal });
        if (!response.ok) throw new Error("Notification read failed");
        const data = await response.json();
        if (pending !== request || request.controller.signal.aborted) return;
        if (typeof data.unread !== "number" || !Number.isFinite(data.unread) || data.unread < 0 || details && !Array.isArray(data.items)) throw new Error("Invalid notification result");
        receive(details ? { unread: data.unread, items: data.items } : { unread: data.unread });
        if (details) detailsStatus("idle");
      } catch {
        // Preserve the current UI through transient failures; the next poll retries.
        if (details && pending === request && !request.controller.signal.aborted) detailsStatus("error");
      } finally {
        if (pending === request) pending = null;
      }
    })();
    return request.promise;
  }
  return { load, pause, cancel, start() { active = true; }, stop() { active = false; cancel(); } };
}
