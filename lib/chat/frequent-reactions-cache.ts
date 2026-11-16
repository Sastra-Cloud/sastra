/** One signed-in app shell owns this cache; nothing is persisted to device storage. */
export function createFrequentReactionsCache(userId: string) {
  let emojis: string[] | null = null;
  let updatedAt = 0;
  let pending: { controller: AbortController; promise: Promise<void> } | null = null;
  const listeners = new Set<() => void>();
  const emit = () => { for (const listener of listeners) listener(); };

  function clear() {
    pending?.controller.abort();
    pending = null;
    emojis = null;
    updatedAt = 0;
    emit();
  }

  function load(force = false): Promise<void> {
    if (!force && pending) return pending.promise;
    if (!force && emojis !== null && Date.now() - updatedAt < 60_000) return Promise.resolve();
    // A saved reaction supersedes any ranking read that started before the write.
    pending?.controller.abort();
    const request = { controller: new AbortController(), promise: Promise.resolve() };
    pending = request;
    request.promise = (async () => {
      try {
        const response = await fetch("/api/chat/reactions", { cache: "no-store", signal: request.controller.signal });
        if (!response.ok) {
          if (pending === request && response.status === 401) clear();
          return;
        }
        const data = await response.json();
        if (pending !== request || request.controller.signal.aborted) return;
        // Shared browser cookies may have changed accounts in another window.
        if (data.userId !== userId) { clear(); return; }
        if (!Array.isArray(data.emojis)) return;
        emojis = data.emojis.filter((item: unknown): item is string => typeof item === "string");
        updatedAt = Date.now();
        emit();
      } catch {
        // Keep the last good ranking (or defaults); the next read can retry.
      } finally {
        if (pending === request) pending = null;
      }
    })();
    return request.promise;
  }

  return {
    userId,
    load,
    clear,
    getSnapshot: () => emojis,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
