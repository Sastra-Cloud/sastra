import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/guards", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/support/service", () => ({ supportRequest: vi.fn() }));
vi.mock("@/lib/ops/version", () => ({
  runningVersion: () => ({ version: "test", revision: null }),
}));
import { getSession } from "@/lib/auth/guards";
import { supportRequest } from "@/lib/support/service";
import { POST } from "@/app/api/support/route";

beforeEach(() => {
  vi.stubEnv("SASTRA_SUPPORT_URL", "https://support.example");
  vi.stubEnv("SASTRA_SUPPORT_INSTANCE_ID", "synthetic");
  vi.stubEnv("SASTRA_SUPPORT_SECRET", "synthetic");
  vi.stubEnv("BETTER_AUTH_URL", "https://app.example");
  vi.mocked(getSession).mockResolvedValue({
    user: {
      id: "actor",
      email: "actor@example.invalid",
      isActive: true,
      role: "member",
    },
  } as Awaited<ReturnType<typeof getSession>>);
  vi.mocked(supportRequest).mockResolvedValue({ tickets: [] });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
const request = (origin?: string, input = { op: "list" }) =>
  new NextRequest("http://container:3000/api/support", {
    method: "POST",
    headers: {
      ...(origin ? { origin } : {}),
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });

describe("support browser origin boundary", () => {
  it("accepts the configured public origin behind Coolify and uses the authenticated actor", async () => {
    expect((await POST(request("https://app.example"))).status).toBe(200);
    expect(supportRequest).toHaveBeenCalledWith({
      op: "list",
      actor: { id: "actor", email: "actor@example.invalid", admin: false },
    });
  });
  it("rejects foreign, malformed, and missing origins without contacting support", async () => {
    for (const origin of ["https://attacker.example", "not a URL", undefined])
      expect((await POST(request(origin))).status).toBe(403);
    expect(getSession).not.toHaveBeenCalled();
    expect(supportRequest).not.toHaveBeenCalled();
  });
  it("ordinary self-hosting returns community help without contacting the service", async () => {
    vi.stubEnv("SASTRA_SUPPORT_SECRET", "");
    expect((await POST(request("https://app.example"))).status).toBe(404);
    expect(supportRequest).not.toHaveBeenCalled();
  });
  it("requires an active authenticated user", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    expect((await POST(request("https://app.example"))).status).toBe(401);
    expect(supportRequest).not.toHaveBeenCalled();
  });
});
