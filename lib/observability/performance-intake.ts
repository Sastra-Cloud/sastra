import "server-only";

import { MAX_REPORT_BYTES, parsePerformanceReport } from "./performance-report";

/** Operator opt-in, read at request time so a restart (not a rebuild) changes it. */
export function performanceMonitoringEnabled(env: Record<string, string | undefined> = process.env) {
  const value = env.SASTRA_PERFORMANCE_MONITORING?.trim().toLowerCase();
  return value === "true" || value === "1";
}

/** Fixed-window limiter with a hard cap on tracked people. */
export function createRateLimiter({
  limit,
  windowMs,
  maxKeys = 1000,
  now = Date.now,
}: {
  limit: number;
  windowMs: number;
  maxKeys?: number;
  now?: () => number;
}) {
  const windows = new Map<string, { start: number; count: number }>();
  return (key: string) => {
    const time = now();
    const current = windows.get(key);
    if (!current || time - current.start >= windowMs) {
      if (!current && windows.size >= maxKeys) {
        for (const [candidate, entry] of windows) {
          if (time - entry.start >= windowMs) windows.delete(candidate);
        }
        // Still full of active windows: drop the oldest rather than grow.
        if (windows.size >= maxKeys) {
          const oldest = windows.keys().next().value;
          if (oldest !== undefined) windows.delete(oldest);
        }
      }
      windows.set(key, { start: time, count: 1 });
      return true;
    }
    current.count += 1;
    return current.count <= limit;
  };
}

export type PerformanceIntakeDependencies = {
  enabled: () => boolean;
  /** Active signed-in person, or null. The id is only used as a rate-limit key. */
  userId: () => Promise<string | null>;
  trustedOrigin: (request: Request) => boolean;
  allow: (userId: string) => boolean;
  record: (entry: { build: string; observations: unknown[] }) => void;
  build: () => string;
};

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

function respond(status: number) {
  return new Response(null, { status, headers: NO_STORE });
}

/**
 * Accepts anonymous numeric observations. It never fails a user action (the
 * browser ignores the response), never echoes input, and never logs a payload
 * it rejected.
 */
export async function handlePerformanceReport(
  request: Request,
  deps: PerformanceIntakeDependencies
): Promise<Response> {
  // Off means off: no auth lookup, no body read, nothing recorded.
  if (!deps.enabled()) return respond(204);
  if (!request.headers.get("origin") || !deps.trustedOrigin(request)) return respond(403);
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(declared) || declared < 0 || declared > MAX_REPORT_BYTES) return respond(413);
  const userId = await deps.userId();
  if (!userId) return respond(401);
  if (!deps.allow(userId)) return respond(429);

  let text = "";
  const reader = request.body?.getReader();
  if (!reader) return respond(400);
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_REPORT_BYTES) {
        // Stop consuming immediately, including chunked bodies without a length.
        void reader.cancel().catch(() => {});
        return respond(413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch {
    return respond(400);
  } finally {
    reader.releaseLock();
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return respond(400);
  }
  const report = parsePerformanceReport(json);
  if (!report) return respond(400);

  deps.record({ build: deps.build(), observations: report.observations });
  return respond(204);
}
