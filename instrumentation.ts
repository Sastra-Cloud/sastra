/**
 * Server error monitoring. Sentry initializes only when SENTRY_DSN is set —
 * with it unset, everything here is a no-op (no overhead, no crash).
 */
export async function register() {
  if (!process.env.SENTRY_DSN) return;
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export async function onRequestError(
  err: unknown,
  request: unknown,
  context: unknown
) {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(err as never, request as never, context as never);
}
