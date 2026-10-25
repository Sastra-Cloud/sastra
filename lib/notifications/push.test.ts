import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  getSession: vi.fn(), send: vi.fn(), insert: vi.fn(), values: vi.fn(),
  select: vi.fn(), update: vi.fn(), remove: vi.fn(),
}));
vi.mock("@/lib/auth/guards", () => ({ getSession: state.getSession }));
vi.mock("@/lib/db", () => ({ db: {
  select: state.select, insert: state.insert, update: state.update, delete: state.remove,
} }));
vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification: state.send } }));
vi.mock("./queries", () => ({ getUnreadCount: vi.fn().mockResolvedValue(0) }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

import { POST } from "@/app/api/push/subscribe/route";
import { deliverTestPush, saveSubscription } from "./push";

const keys = { p256dh: "dummy-public-key", auth: "dummy-auth-key" };
const endpoint = "https://fcm.googleapis.com/fcm/send/dummy-device";
const request = (url = endpoint) => new Request("https://sastra.example/api/push/subscribe", {
  method: "POST", body: JSON.stringify({ endpoint: url, keys }),
  headers: { "content-type": "application/json" },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VAPID_PUBLIC_KEY", "dummy-public-key");
  vi.stubEnv("VAPID_PRIVATE_KEY", "dummy-private-key");
  vi.stubEnv("VAPID_SUBJECT", "mailto:push@example.test");
  state.getSession.mockResolvedValue({ user: { id: "member", isActive: true } });
  state.values.mockReturnValue({ onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) });
  state.insert.mockReturnValue({ values: state.values });
  state.update.mockReturnValue({ set: () => ({ where: vi.fn().mockResolvedValue(undefined) }) });
  state.send.mockResolvedValue({ statusCode: 201 });
});
afterEach(() => vi.unstubAllEnvs());

describe("push registration and delivery", () => {
  it("rejects arbitrary destinations at the API and persistence boundaries", async () => {
    expect((await POST(request("https://127.0.0.1/internal"))).status).toBe(400);
    await expect(saveSubscription("member", { endpoint: "https://attacker.example/push", keys }))
      .rejects.toThrow();
    expect(state.insert).not.toHaveBeenCalled();
  });

  it.each([null, { user: { id: "disabled", isActive: false } }])(
    "rejects missing or inactive sessions before saving", async (session) => {
      state.getSession.mockResolvedValue(session);
      expect((await POST(request())).status).toBe(401);
      expect(state.insert).not.toHaveBeenCalled();
    },
  );

  it("registers an active user's supported browser subscription", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(state.values).toHaveBeenCalledWith(expect.objectContaining({ userId: "member", endpoint }));
  });

  it("blocks an old unsafe row before transport while delivering a valid sibling", async () => {
    state.select.mockReturnValue({ from: () => ({ where: async () => [
      { id: "old", endpoint: "https://127.0.0.1/internal", ...keys, failureCount: 0 },
      { id: "valid", endpoint, ...keys, failureCount: 0 },
    ] }) });
    await expect(deliverTestPush("member")).resolves.toEqual({
      configured: true, devices: 2, sent: 1, failed: 1,
    });
    expect(state.send).toHaveBeenCalledTimes(1);
    expect(state.send).toHaveBeenCalledWith({ endpoint, keys }, expect.any(String), expect.any(Object));
  });
});
