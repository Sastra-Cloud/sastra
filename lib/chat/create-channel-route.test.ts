import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), createChannel: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/chat/actions", () => ({ createChannel: mocks.createChannel }));
import { POST } from "@/app/api/chat/channels/route";

function request(origin = "https://workspace.example") {
  return new Request("https://workspace.example/api/chat/channels", {
    method: "POST", headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Cover review", memberIds: ["teammate-a"] }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "actor", role: "manager", isActive: true } });
  mocks.createChannel.mockResolvedValue({ ok: true, id: "channel", memberCount: 2 });
});

describe("stable channel creation endpoint", () => {
  it("keeps the existing authorization and transaction boundary and returns its canonical result", async () => {
    const response = await POST(request());
    expect(await response.json()).toEqual({ ok: true, id: "channel", memberCount: 2 });
    expect(mocks.createChannel).toHaveBeenCalledOnce();
    const data = mocks.createChannel.mock.calls[0][1] as FormData;
    expect(data.get("name")).toBe("Cover review");
    expect(data.getAll("memberIds")).toEqual(["teammate-a"]);
  });

  it.each([null, { user: { id: "actor", role: "manager", isActive: false } }])("rejects absent or inactive sessions before creating anything", async (session) => {
    mocks.getSession.mockResolvedValue(session);
    expect((await POST(request())).status).toBe(401);
    expect(mocks.createChannel).not.toHaveBeenCalled();
  });

  it("rejects ordinary members even with otherwise valid input", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "actor", role: "member", isActive: true } });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.createChannel).not.toHaveBeenCalled();
  });

  it("rejects cross-site writes before any action invocation", async () => {
    expect((await POST(request("https://attacker.example"))).status).toBe(403);
    expect(mocks.createChannel).not.toHaveBeenCalled();
  });

  it("does not replay uncertain creation or expose a server exception", async () => {
    mocks.createChannel.mockRejectedValue(new Error("database private details"));
    const response = await POST(request());
    const body = await response.json();
    expect(body.error).toContain("Check the channel list");
    expect(body.error).not.toContain("private details");
    expect(mocks.createChannel).toHaveBeenCalledOnce();
  });
});
