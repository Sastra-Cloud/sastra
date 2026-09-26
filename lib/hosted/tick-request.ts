import "server-only";

import { randomUUID } from "node:crypto";

import { after } from "next/server";

import { logger } from "@/lib/logger";

import { MANAGEMENT_HEADERS, signManagementRequest } from "./management-auth";
import { hostedAccountUrl, hostedInstanceId } from "./mode";

/**
 * Sastra Cloud ticks a workspace only when the workspace said work is due (the
 * `nextDueAt` of its last tick), so its database can sleep between jobs. When a
 * request creates work sooner than that, such as a notification email, the
 * instance asks the control plane for an earlier tick with a signed request.
 * Self-hosted schedulers call the tick every minute and skip all of this.
 */

type TickRequestState = { tickRunning: boolean; requestedFor: number | null; requestedAt: number };

// Kept on globalThis so every route bundle in the process shares one state.
const STATE_KEY = Symbol.for("sastra.hosted.tickRequest");

function state(): TickRequestState {
  const g = globalThis as { [STATE_KEY]?: TickRequestState };
  g[STATE_KEY] ??= { tickRunning: false, requestedFor: null, requestedAt: 0 };
  return g[STATE_KEY];
}

/** Ask again when a request has gone this long without a tick answering it. */
const UNANSWERED_AFTER_MS = 10 * 60_000;

export function noteScheduledTickStarted() {
  const s = state();
  s.tickRunning = true;
  s.requestedFor = null;
}

export function noteScheduledTickFinished() {
  state().tickRunning = false;
}

export type TickRequestDeps = {
  env: Record<string, string | undefined>;
  fetchImpl: typeof fetch;
  now: () => number;
  /** Run the send after the response (Next's `after`), or right away. */
  defer: (task: () => Promise<void>) => void;
};

const defaultDeps: TickRequestDeps = {
  env: process.env,
  fetchImpl: (...args) => fetch(...args),
  now: () => Date.now(),
  defer: (task) => {
    try {
      after(task);
    } catch {
      void task(); // outside a request (scripts, tests)
    }
  },
};

/**
 * Make sure the control plane ticks this workspace by `when` (default: now).
 * Does nothing outside Sastra Cloud, while a tick is running (it reports the
 * next due time itself), or when an earlier tick is already requested.
 */
export function requestScheduledTick(when: Date = new Date(), deps: TickRequestDeps = defaultDeps): void {
  const instanceId = hostedInstanceId(deps.env);
  const accountUrl = hostedAccountUrl(deps.env);
  const secret = deps.env.SASTRA_CLOUD_MANAGEMENT_SECRET?.trim();
  if (!instanceId || !accountUrl || !secret) return;

  const s = state();
  const now = deps.now();
  const at = Math.max(now, when.getTime());
  if (s.tickRunning) return;
  if (s.requestedFor !== null && s.requestedFor <= at && now - s.requestedAt < UNANSWERED_AFTER_MS) return;
  s.requestedFor = at;
  s.requestedAt = now;

  deps.defer(async () => {
    const body = JSON.stringify({ at: new Date(at).toISOString() });
    const timestamp = Math.floor(deps.now() / 1000);
    const eventId = `tick_${randomUUID()}`;
    try {
      const res = await deps.fetchImpl(
        `${accountUrl.replace(/\/+$/, "")}/instances/${encodeURIComponent(instanceId)}/tick-request`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            [MANAGEMENT_HEADERS.timestamp]: String(timestamp),
            [MANAGEMENT_HEADERS.eventId]: eventId,
            [MANAGEMENT_HEADERS.signature]: signManagementRequest(secret, timestamp, eventId, body),
          },
          body,
          signal: AbortSignal.timeout(10_000),
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (error) {
      // Let the next request try again; the daily jobs still bound the delay.
      if (state().requestedFor === at) state().requestedFor = null;
      logger.warn("tick request to Sastra Cloud failed", { error: error instanceof Error ? error.message : String(error) });
    }
  });
}

/** Test helper: forget any pending request and running tick. */
export function resetTickRequestStateForTests() {
  const s = state();
  s.tickRunning = false;
  s.requestedFor = null;
  s.requestedAt = 0;
}
