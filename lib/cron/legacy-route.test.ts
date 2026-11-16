import { beforeEach, describe, expect, it, vi } from "vitest";

const runScheduledTick = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("./auth", () => ({ isCronRequestAuthorized: () => true }));
vi.mock("./scheduled", () => ({ runScheduledTick }));

const { legacyCronRoute } = await import("./legacy-route");
const request = () => new Request("http://localhost/api/cron/gmail-poll", { method: "POST" });

describe("legacyCronRoute", () => {
  beforeEach(() => runScheduledTick.mockReset());

  it("does not report a failure when an earlier run is still working", async () => {
    runScheduledTick.mockResolvedValue({ ran: [], nextDueAt: null });
    const response = await legacyCronRoute("gmail-poll")(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, skipped: "already-running" });
  });

  it("still reports a job that ran and failed", async () => {
    runScheduledTick.mockResolvedValue({
      ran: [{ name: "gmail-poll", ok: false, note: "failed", result: {} }],
      nextDueAt: null,
    });
    const response = await legacyCronRoute("gmail-poll")(request());
    expect(response.status).toBe(500);
  });
});
