import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFrequentReactions } from "./use-frequent-reactions";
import { DEFAULT_REACTIONS } from "@/lib/chat/reaction-suggestions";

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, effects: [] as Array<() => void | (() => void)> }));
vi.mock("react", () => ({
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void | (() => void)) => hooks.effects.push(effect),
  useState(initial: unknown) {
    const i = hooks.cursor++;
    if (!(i in hooks.values)) hooks.values[i] = initial;
    return [hooks.values[i], (next: unknown) => { hooks.values[i] = typeof next === "function" ? next(hooks.values[i]) : next; }];
  },
}));
function HookProbe({ userId }: { userId: string }) { return useFrequentReactions(userId); }
function render(userId = "first-user") {
  hooks.cursor = 0; hooks.effects = [];
  return HookProbe({ userId });
}
const result = (emojis: string[]) => ({ ok: true, json: async () => ({ emojis }) });
beforeEach(() => { hooks.values = []; hooks.cursor = 0; hooks.effects = []; });
afterEach(() => vi.unstubAllGlobals());
describe("personal reaction loading", () => {
  it("shows defaults immediately and after an unavailable history", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", fetch);
    expect(render().emojis).toEqual(DEFAULT_REACTIONS);
    hooks.effects[0]();
    await vi.waitFor(() => expect(fetch).toHaveResolved());
    expect(render().emojis).toEqual(DEFAULT_REACTIONS);
  });
  it("uses personal rankings after a read and refreshes after a saved reaction", async () => {
    const fetch = vi.fn().mockResolvedValue(result(["🙏🏽", "🔥"]));
    vi.stubGlobal("fetch", fetch);
    render(); hooks.effects[0]();
    await vi.waitFor(() => expect(render().emojis.slice(0, 2)).toEqual(["🙏🏽", "🔥"]));
    render().refresh();
    fetch.mockResolvedValue(result(["🔥", "🙏🏽"]));
    render(); hooks.effects[0]();
    await vi.waitFor(() => expect(render().emojis.slice(0, 2)).toEqual(["🔥", "🙏🏽"]));
  });
  it("does not expose the previous account or accept an aborted read", async () => {
    let finish!: (value: ReturnType<typeof result>) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise(resolve => { finish = resolve; })));
    render(); const cleanup = hooks.effects[0]();
    if (typeof cleanup === "function") cleanup();
    expect(render("second-user").emojis).toEqual(DEFAULT_REACTIONS);
    finish(result(["🔥"]));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(render("second-user").emojis).toEqual(DEFAULT_REACTIONS);
    expect(render("first-user").emojis).toEqual(DEFAULT_REACTIONS);
  });
});
