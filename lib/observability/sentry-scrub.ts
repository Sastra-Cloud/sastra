type SentryEvent = {
  user?: Record<string, unknown>;
  request?: {
    data?: unknown;
    cookies?: unknown;
    headers?: Record<string, unknown>;
    [key: string]: unknown;
  };
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  [key: string]: unknown;
};

/** Remove donor/file/auth payloads before an event leaves the application. */
export function scrubSentryEvent<T>(event: T): T {
  const mutable = event as SentryEvent;
  if (mutable.user) {
    mutable.user = mutable.user.id ? { id: mutable.user.id } : {};
  }
  if (mutable.request) {
    delete mutable.request.data;
    delete mutable.request.cookies;
    if (mutable.request.headers) {
      const safeHeaders: Record<string, unknown> = {};
      for (const key of ["content-type", "user-agent"]) {
        if (mutable.request.headers[key]) {
          safeHeaders[key] = mutable.request.headers[key];
        }
      }
      mutable.request.headers = safeHeaders;
    }
  }
  delete mutable.extra;
  return event;
}
