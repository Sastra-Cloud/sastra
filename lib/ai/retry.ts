/**
 * Shared timeout + retry helpers for AI calls. Pure (no `server-only`, no DB) so
 * the logic is unit-testable. Used by every primitive in `lib/ai/openrouter.ts`
 * to wrap the underlying `chat.completions.create` call.
 */

export class AiTimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = "AiTimeoutError";
  }
}

/** Reject if `p` doesn't settle within `ms`. Always clears its timer. */
export async function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  label: string,
  onTimeout?: () => void
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout?.();
      reject(new AiTimeoutError(label, ms));
    }, ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

/** Pull an HTTP status off an unknown error, however the SDK exposes it. */
export function statusOf(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const e = err as Record<string, unknown>;
  const candidates = [e.status, e.statusCode, (e.response as { status?: unknown } | undefined)?.status];
  for (const c of candidates) {
    if (typeof c === "number" && c >= 100 && c < 600) return c;
  }
  return undefined;
}

/**
 * Whether an AI/network error is worth retrying: transient server-side (5xx),
 * rate limits (429), our own timeout, and connection-level failures. Deterministic
 * client errors (other 4xx — bad request, auth, not found) are NOT retried.
 */
export function isRetryableAiError(err: unknown): boolean {
  if (err instanceof AiTimeoutError) return true;

  const status = statusOf(err);
  if (status !== undefined) {
    if (status === 429) return true;
    if (status >= 500) return true;
    return false; // any other 4xx is a deterministic client error
  }

  // No HTTP status → treat as a network/connection error (OpenAI SDK
  // APIConnectionError, undici/fetch TypeError, ECONNRESET/ETIMEDOUT, etc.).
  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    const name = typeof e.name === "string" ? e.name : "";
    const code = typeof e.code === "string" ? e.code : "";
    if (name === "APIConnectionError" || name === "APIConnectionTimeoutError") return true;
    if (name === "TypeError" && String(e.message ?? "").toLowerCase().includes("fetch")) return true;
    if (["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EAI_AGAIN", "ENOTFOUND"].includes(code)) return true;
  }
  return false;
}

export type RetryOptions = {
  /** Per-attempt timeout. Default 120s (long enough for PDF/vision extraction). */
  timeoutMs?: number;
  /** Retry attempts after the first try. Default 1 (so up to 2 calls total). */
  retries?: number;
  /** Base backoff before the first retry; grows exponentially with jitter. */
  backoffMs?: number;
  /** Injectable sleep (tests pass a no-op). */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable jitter in [0,1) (tests pass a constant). */
  jitter?: () => number;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Run `fn` with a per-attempt timeout, retrying only retryable errors with
 * exponential backoff + jitter. Non-retryable errors and the final attempt's
 * error propagate unchanged.
 */
export async function callWithRetry<T>(
  label: string,
  fn: (signal: AbortSignal) => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const retries = opts.retries ?? 1;
  const backoffMs = opts.backoffMs ?? 1_000;
  const sleep = opts.sleep ?? defaultSleep;
  const jitter = opts.jitter ?? Math.random;

  let attempt = 0;
  for (;;) {
    const controller = new AbortController();
    try {
      return await withTimeout(
        fn(controller.signal),
        timeoutMs,
        label,
        () => controller.abort(new AiTimeoutError(label, timeoutMs))
      );
    } catch (err) {
      if (attempt >= retries || !isRetryableAiError(err)) throw err;
      const delay = Math.round(backoffMs * 2 ** attempt * (1 + jitter()));
      attempt++;
      await sleep(delay);
    }
  }
}
