import { describe, expect, it, vi } from "vitest";

import {
  createRateLimiter,
  handlePerformanceReport,
  performanceMonitoringEnabled,
  type PerformanceIntakeDependencies,
} from "./performance-intake";

const body = JSON.stringify({
  version: 1,
  observations: [{ name: "LCP", route: "dashboard", navigation: "hard", value: 812.25 }],
});

function post(payload: string, headers: Record<string, string> = { origin: "https://app.test" }) {
  return new Request("https://app.test/api/observability/performance", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: payload,
  });
}

function deps(overrides: Partial<PerformanceIntakeDependencies> = {}) {
  const record = vi.fn();
  const userId = vi.fn(async () => "user-1");
  const value: PerformanceIntakeDependencies = {
    enabled: () => true,
    userId,
    trustedOrigin: (request) => request.headers.get("origin") === "https://app.test",
    allow: () => true,
    record,
    build: () => "build-7",
    ...overrides,
  };
  return { value, record, userId };
}

describe("performance intake", () => {
  it("is off unless the operator opts in", () => {
    expect(performanceMonitoringEnabled({})).toBe(false);
    expect(performanceMonitoringEnabled({ SASTRA_PERFORMANCE_MONITORING: "false" })).toBe(false);
    expect(performanceMonitoringEnabled({ SASTRA_PERFORMANCE_MONITORING: "true" })).toBe(true);
  });

  // Protects "disabled means nothing is collected", even if a stale tab posts.
  it("records nothing, and does not even look up the session, when disabled", async () => {
    const { value, record, userId } = deps({ enabled: () => false });
    const response = await handlePerformanceReport(post(body), value);
    expect(response.status).toBe(204);
    expect(record).not.toHaveBeenCalled();
    expect(userId).not.toHaveBeenCalled();
  });

  it("records a valid report with the server's build and the exact numbers", async () => {
    const { value, record } = deps();
    const response = await handlePerformanceReport(post(body), value);
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(record).toHaveBeenCalledWith({
      build: "build-7",
      observations: [{ name: "LCP", route: "dashboard", navigation: "hard", value: 812.25 }],
    });
  });

  it("rejects cross-origin, missing-origin, and signed-out requests without recording", async () => {
    const crossOrigin = deps();
    expect((await handlePerformanceReport(post(body, { origin: "https://evil.test" }), crossOrigin.value)).status).toBe(403);
    expect((await handlePerformanceReport(post(body, {}), crossOrigin.value)).status).toBe(403);
    expect(crossOrigin.userId).not.toHaveBeenCalled();

    const signedOut = deps({ userId: async () => null });
    expect((await handlePerformanceReport(post(body), signedOut.value)).status).toBe(401);
    expect(crossOrigin.record).not.toHaveBeenCalled();
    expect(signedOut.record).not.toHaveBeenCalled();
  });

  it("rejects oversized, malformed, and extra-field bodies without recording them", async () => {
    const { value, record } = deps();
    const padded = JSON.stringify({ version: 1, observations: [], note: "x".repeat(4000) });
    expect((await handlePerformanceReport(post(padded), value)).status).toBe(413);
    expect((await handlePerformanceReport(post("{not json"), value)).status).toBe(400);
    const extra = JSON.stringify({
      version: 1,
      observations: [{ name: "LCP", route: "dashboard", navigation: "hard", value: 1, url: "/projects/x" }],
    });
    expect((await handlePerformanceReport(post(extra), value)).status).toBe(400);
    expect(record).not.toHaveBeenCalled();
  });

  it("limits how many reports one person can send in a window", async () => {
    let time = 0;
    const allow = createRateLimiter({ limit: 2, windowMs: 1000, now: () => time });
    const { value } = deps({ allow });
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await handlePerformanceReport(post(body), value)).status);
    expect(statuses).toEqual([204, 204, 429]);
    time = 1001;
    expect((await handlePerformanceReport(post(body), value)).status).toBe(204);
  });

  it("stops reading chunked reports at the byte limit, including multibyte text", async () => {
    const cancel = vi.fn();
    let chunks = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        chunks += 1;
        controller.enqueue(new TextEncoder().encode("é".repeat(600)));
      },
      cancel,
    }, { highWaterMark: 0 });
    const request = new Request("https://app.test/api/observability/performance", {
      method: "POST", headers: { origin: "https://app.test" }, body: stream,
      duplex: "half",
    } as RequestInit);
    const { value, record } = deps();
    expect((await handlePerformanceReport(request, value)).status).toBe(413);
    expect(chunks).toBe(2);
    expect(cancel).toHaveBeenCalledOnce();
    expect(record).not.toHaveBeenCalled();
  });

  it("never tracks more people than its cap", () => {
    const allow = createRateLimiter({ limit: 1, windowMs: 10_000, maxKeys: 2, now: () => 0 });
    expect(allow("a")).toBe(true);
    expect(allow("b")).toBe(true);
    expect(allow("c")).toBe(true); // evicts the oldest instead of growing
    expect(allow("a")).toBe(true); // "a" was evicted, so it starts a new window
    expect(allow("c")).toBe(false);
  });
});
