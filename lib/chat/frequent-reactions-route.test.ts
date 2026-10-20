import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSession } from "@/lib/auth/guards";
import { getFrequentReactions } from "@/lib/chat/queries";
import { GET } from "@/app/api/chat/reactions/route";

vi.mock("@/lib/auth/guards", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/chat/queries", () => ({ getFrequentReactions: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
describe("personal reaction history", () => {
  it("rejects unauthenticated reads without querying usage", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect(getFrequentReactions).not.toHaveBeenCalled();
  });
  it("reads only the signed-in user's usage and prevents shared caching", async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { id: "signed-in-user" } } as NonNullable<Awaited<ReturnType<typeof getSession>>>);
    vi.mocked(getFrequentReactions).mockResolvedValue(["🙏🏽", "🔥"]);
    const response = await GET();
    expect(getFrequentReactions).toHaveBeenCalledExactlyOnceWith("signed-in-user");
    expect(await response.json()).toEqual({ emojis: ["🙏🏽", "🔥"] });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
