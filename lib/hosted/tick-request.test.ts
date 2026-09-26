import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn() }));

import { signManagementRequest } from "./management-auth";
import {
  noteScheduledTickFinished,
  noteScheduledTickStarted,
  requestScheduledTick,
  resetTickRequestStateForTests,
  type TickRequestDeps,
} from "./tick-request";

const env = {
  SASTRA_CLOUD_INSTANCE_ID: "ws_1",
  SASTRA_CLOUD_ACCOUNT_URL: "https://account.example/",
  SASTRA_CLOUD_MANAGEMENT_SECRET: "secret",
};

function harness(overrides: Partial<TickRequestDeps> = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  let clock = Date.parse("2026-09-25T10:00:00Z");
  const tasks: (() => Promise<void>)[] = [];
  const deps: TickRequestDeps = {
    env,
    now: () => clock,
    fetchImpl: (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch,
    defer: (task) => tasks.push(task),
    ...overrides,
  };
  const flush = async () => { while (tasks.length) await tasks.shift()!(); };
  return { deps, calls, flush, advance: (ms: number) => { clock += ms; } };
}

describe("requestScheduledTick", () => {
  beforeEach(() => resetTickRequestStateForTests());

  it("does nothing outside Sastra Cloud", async () => {
    const h = harness({ env: {} });
    requestScheduledTick(new Date(), h.deps);
    await h.flush();
    expect(h.calls).toEqual([]);
  });

  it("sends one signed request and skips later work until a tick answers it", async () => {
    const h = harness();
    requestScheduledTick(new Date("2026-09-25T10:00:00Z"), h.deps);
    requestScheduledTick(new Date("2026-09-25T10:05:00Z"), h.deps); // later than the pending request
    await h.flush();
    expect(h.calls).toHaveLength(1);
    const { url, init } = h.calls[0];
    expect(url).toBe("https://account.example/instances/ws_1/tick-request");
    const headers = init.headers as Record<string, string>;
    expect(JSON.parse(String(init.body))).toEqual({ at: "2026-09-25T10:00:00.000Z" });
    expect(headers["x-sastra-signature"]).toBe(
      signManagementRequest("secret", Number(headers["x-sastra-timestamp"]), headers["x-sastra-event-id"], String(init.body))
    );

    // Earlier work than the pending request still goes out.
    resetTickRequestStateForTests();
    requestScheduledTick(new Date("2026-09-25T11:00:00Z"), h.deps);
    requestScheduledTick(new Date("2026-09-25T10:30:00Z"), h.deps);
    await h.flush();
    expect(h.calls).toHaveLength(3);
  });

  it("stays quiet during a tick, which reports its own next due time", async () => {
    const h = harness();
    noteScheduledTickStarted();
    requestScheduledTick(new Date(), h.deps);
    noteScheduledTickFinished();
    await h.flush();
    expect(h.calls).toEqual([]);
    requestScheduledTick(new Date(), h.deps);
    await h.flush();
    expect(h.calls).toHaveLength(1);
  });

  it("asks again after a failed send or an unanswered request", async () => {
    let fail = true;
    const h = harness({
      fetchImpl: (async () => new Response("{}", { status: fail ? 503 : 200 })) as unknown as typeof fetch,
    });
    const sent: number[] = [];
    const deps = { ...h.deps, fetchImpl: (async (...args: Parameters<typeof fetch>) => { sent.push(1); return h.deps.fetchImpl(...args); }) as typeof fetch };
    requestScheduledTick(new Date(), deps);
    await h.flush();
    fail = false;
    requestScheduledTick(new Date(), deps);
    await h.flush();
    expect(sent).toHaveLength(2);
    requestScheduledTick(new Date(), deps); // pending, not yet answered
    await h.flush();
    expect(sent).toHaveLength(2);
    h.advance(11 * 60_000);
    requestScheduledTick(new Date(), deps);
    await h.flush();
    expect(sent).toHaveLength(3);
  });
});
