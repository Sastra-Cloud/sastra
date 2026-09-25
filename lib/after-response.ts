import "server-only";

import { after } from "next/server";

import { logger } from "@/lib/logger";

/**
 * Run best-effort follow-up work without delaying the caller.
 *
 * Inside a Server Function, Route Handler (cron routes included), or render,
 * Next's `after()` tracks the task so the response is sent first and hosts
 * that suspend an idle instance (Fly Machines, serverless `waitUntil`) keep the
 * process alive until it settles. `after()` throws when there is no request
 * scope (scripts, tests), so we fall back to a detached promise there.
 *
 * Errors are logged with `label`, never thrown.
 */
export function runAfterResponse(
  label: string,
  task: () => Promise<unknown>
): void {
  const run = async () => {
    try {
      await task();
    } catch (err) {
      logger.error(`${label} failed`, err);
    }
  };
  try {
    after(run);
  } catch {
    void run();
  }
}
