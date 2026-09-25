import "server-only";

type Meta = Record<string, unknown>;

/** Minimal structured server logger. Errors also reach Sentry via instrumentation. */
export const logger = {
  info(msg: string, meta?: Meta) {
    console.log(`[info] ${msg}`, meta ?? "");
  },
  warn(msg: string, meta?: Meta) {
    console.warn(`[warn] ${msg}`, meta ?? "");
  },
  error(msg: string, err?: unknown, meta?: Meta) {
    console.error(`[error] ${msg}`, err ?? "", meta ?? "");
  },
};
