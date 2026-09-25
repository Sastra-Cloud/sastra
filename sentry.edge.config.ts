import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@/lib/observability/sentry-scrub";

// Only imported (from instrumentation.ts) when SENTRY_DSN is set.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  beforeSend: scrubSentryEvent,
});
