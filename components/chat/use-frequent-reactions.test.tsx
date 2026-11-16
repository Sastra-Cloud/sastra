import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFrequentReactions } from "./use-frequent-reactions";
import { DEFAULT_REACTIONS } from "@/lib/chat/reaction-suggestions";
import { createFrequentReactionsCache } from "@/lib/chat/frequent-reactions-cache";

const hooks = vi.hoisted(() => ({ cache: null as ReturnType<typeof createFrequentReactionsCache> | null, effects: [] as Array<() => void | (() => void)> }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useContext: () => hooks.cache,
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
  useCallback: (callback: unknown) => callback,
  useMemo: (calculate: () => unknown) => calculate(),
  useEffect: (effect: () => void | (() => void)) => hooks.effects.push(effect),
}));
function HookProbe({ userId }: { userId: string }) { return useFrequentReactions(userId); }
function render(userId = "first-user") {
  hooks.effects = [];
  return HookProbe({ userId });
}
const result = (emojis: string[], userId = "first-user") => Response.json({ userId, emojis });
beforeEach(() => { hooks.cache = createFrequentReactionsCache("first-user"); hooks.effects = []; vi.stubGlobal("window", new EventTarget()); });
afterEach(() => { hooks.cache?.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("personal reaction loading", () => {
  it("shows defaults immediately and after an unavailable history", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", fetch);
    expect(render().emojis).toEqual(DEFAULT_REACTIONS);
    await hooks.cache!.load();
    expect(render().emojis).toEqual(DEFAULT_REACTIONS);
    fetch.mockResolvedValue(result(["🔥"]));
    await hooks.cache!.load();
    expect(render().emojis[0]).toBe("🔥");
  });
  it("shares one ranking read across remounts, expires it, and refreshes after a saved reaction", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1_000);
    const fetch = vi.fn().mockResolvedValue(result(["🙏🏽", "🔥"]));
    vi.stubGlobal("fetch", fetch);
    render(); hooks.effects[0]();
    await Promise.all([hooks.cache!.load(), hooks.cache!.load()]);
    render(); hooks.effects[0]();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(render().emojis.slice(0, 2)).toEqual(["🙏🏽", "🔥"]);
    clock.mockReturnValue(61_000);
    fetch.mockImplementation(async () => result(["🙏🏽", "🔥"]));
    await hooks.cache!.load();
    expect(fetch).toHaveBeenCalledTimes(2);
    fetch.mockImplementation(async () => result(["🔥", "🙏🏽"]));
    render().refresh();
    await vi.waitFor(() => expect(render().emojis.slice(0, 2)).toEqual(["🔥", "🙏🏽"]));
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("does not expose the previous account or accept a read after sign-out cleanup", async () => {
    const fetch = vi.fn().mockImplementation(async () => result(["🙏🏽", "🔥"]));
    vi.stubGlobal("fetch", fetch);
    await hooks.cache!.load();
    await vi.waitFor(() => expect(render().emojis.slice(0, 2)).toEqual(["🙏🏽", "🔥"]));
    expect(render("second-user").emojis).toEqual(DEFAULT_REACTIONS);
    let finish!: (value: Response) => void;
    fetch.mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }));
    const oldCache = hooks.cache!;
    const pending = oldCache.load(true);
    oldCache.clear();
    expect((fetch.mock.calls.at(-1) as unknown as [string, RequestInit])[1].signal?.aborted).toBe(true);
    hooks.cache = createFrequentReactionsCache("second-user");
    finish(result(["🔥"]));
    await pending;
    expect(oldCache.getSnapshot()).toBeNull();
    expect(render("second-user").emojis).toEqual(DEFAULT_REACTIONS);
    fetch.mockImplementation(async () => result(["👀"], "second-user"));
    await hooks.cache.load();
    expect(render("second-user").emojis[0]).toBe("👀");
  });
  it("prevents a ranking read from before a saved reaction overwriting its refresh", async () => {
    let finishOld!: (value: Response) => void;
    const fetch = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { finishOld = resolve; }))
      .mockImplementationOnce(async () => result(["🔥"]));
    vi.stubGlobal("fetch", fetch);
    const old = hooks.cache!.load();
    await hooks.cache!.load(true);
    finishOld(result(["👍"]));
    await old;
    expect(render().emojis[0]).toBe("🔥");
  });
  it("retains rankings through a network failure but clears them after an auth change", async () => {
    const fetch = vi.fn().mockImplementation(async () => result(["🔥"]));
    vi.stubGlobal("fetch", fetch);
    await hooks.cache!.load();
    fetch.mockRejectedValueOnce(new TypeError("offline"));
    await hooks.cache!.load(true);
    expect(render().emojis[0]).toBe("🔥");
    fetch.mockResolvedValueOnce(new Response(null, { status: 401 }));
    await hooks.cache!.load(true);
    expect(render().emojis).toEqual(DEFAULT_REACTIONS);
    fetch.mockImplementation(async () => result(["👀"], "second-user"));
    await hooks.cache!.load();
    expect(render().emojis).toEqual(DEFAULT_REACTIONS);
  });
});
