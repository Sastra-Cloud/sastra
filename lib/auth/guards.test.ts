import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authSession: vi.fn(),
  headers: vi.fn(),
  select: vi.fn(),
  portfolio: vi.fn(),
  canAccessChannel: vi.fn(),
  messages: vi.fn(),
  pins: vi.fn(),
}));

vi.mock("./auth", () => ({ auth: { api: { getSession: mocks.authSession } } }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));
vi.mock("./assurance", () => ({ isAdminAssured: vi.fn() }));
vi.mock("@/lib/reports/export", () => ({ buildPortfolioWorkbook: mocks.portfolio }));
vi.mock("@/lib/chat/access", () => ({ canAccessChannel: mocks.canAccessChannel }));
vi.mock("@/lib/chat/queries", () => ({ getRecentMessages: mocks.messages }));
vi.mock("@/lib/chat/pins", () => ({ listChannelPins: mocks.pins }));

import { getSession, requireUser } from "./guards";
import { GET as getPortfolio } from "@/app/api/reports/portfolio/route";
import { GET as getRecentChat } from "@/app/api/chat/[channelId]/recent/route";

const activeSession = {
  session: { id: "existing-session" },
  user: { id: "teammate-1", role: "manager", isActive: true },
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.headers.mockResolvedValue(new Headers({ cookie: "fixture-session=present" }));
  mocks.authSession.mockResolvedValue(activeSession);
  mocks.portfolio.mockResolvedValue({
    xlsx: { writeBuffer: async () => new Uint8Array([1, 2, 3]) },
  });
  mocks.canAccessChannel.mockResolvedValue(true);
  mocks.messages.mockResolvedValue([{ id: "message-1", body: "Team update" }]);
  mocks.pins.mockResolvedValue([]);
});

describe("application session activity", () => {
  it("preserves active identity and forwards the request headers", async () => {
    expect(await getSession()).toBe(activeSession);
    expect(await requireUser()).toBe(activeSession);
    expect(mocks.authSession).toHaveBeenCalledWith({
      headers: await mocks.headers.mock.results[0].value,
    });
  });

  it("rejects an existing session after its account is disabled", async () => {
    mocks.authSession.mockResolvedValue({
      ...activeSession,
      user: { ...activeSession.user, isActive: false },
    });

    expect(await getSession()).toBeNull();
    await expect(requireUser()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("keeps missing sessions unauthenticated", async () => {
    mocks.authSession.mockResolvedValue(null);
    expect(await getSession()).toBeNull();
  });
});

describe("API routes use the active application session", () => {
  it("allows active managers to export, then stops disabled managers before report reads", async () => {
    const allowed = await getPortfolio();
    expect(allowed.status).toBe(200);
    expect(new Uint8Array(await allowed.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(mocks.portfolio).toHaveBeenCalledOnce();
    mocks.portfolio.mockClear();
    mocks.authSession.mockResolvedValue({
      ...activeSession,
      user: { ...activeSession.user, isActive: false },
    });

    expect((await getPortfolio()).status).toBe(401);
    expect(mocks.portfolio).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("allows active chat readers, then stops disabled accounts before membership or message reads", async () => {
    const request = new Request("http://localhost/api/chat/channel-1/recent");
    const context = { params: Promise.resolve({ channelId: "channel-1" }) };
    const allowed = await getRecentChat(request, context);
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toEqual({
      messages: [{ id: "message-1", body: "Team update" }],
      pins: [],
    });
    expect(mocks.messages).toHaveBeenCalledWith("channel-1", "teammate-1");
    mocks.canAccessChannel.mockClear();
    mocks.messages.mockClear();
    mocks.pins.mockClear();
    mocks.authSession.mockResolvedValue({
      ...activeSession,
      user: { ...activeSession.user, isActive: false },
    });

    expect((await getRecentChat(request, context)).status).toBe(401);
    expect(mocks.canAccessChannel).not.toHaveBeenCalled();
    expect(mocks.messages).not.toHaveBeenCalled();
    expect(mocks.pins).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
