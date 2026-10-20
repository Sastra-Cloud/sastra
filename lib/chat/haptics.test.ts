import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messageHoldHaptic } from "./haptics";

const library = vi.hoisted(() => ({ create: vi.fn(), trigger: vi.fn(), destroy: vi.fn() }));
vi.mock("web-haptics", () => ({ WebHaptics: class {
  constructor(options: unknown) { library.create(options); }
  trigger = library.trigger;
  destroy = library.destroy;
} }));
beforeEach(() => {
  vi.clearAllMocks();
  library.trigger.mockResolvedValue(undefined);
  vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
  vi.stubGlobal("document", {});
});
afterEach(() => vi.unstubAllGlobals());
describe("message hold haptics", () => {
  it("requests one quiet pulse and removes the fallback control afterwards", async () => {
    await messageHoldHaptic();
    expect(library.create).toHaveBeenCalledExactlyOnceWith({ debug: false, showSwitch: false });
    expect(library.trigger).toHaveBeenCalledExactlyOnceWith(10, { intensity: 1 });
    expect(library.destroy).toHaveBeenCalledOnce();
  });
  it("lets the library provide its fallback when the vibration API is absent", async () => {
    vi.stubGlobal("navigator", {});
    await messageHoldHaptic();
    expect(library.trigger).toHaveBeenCalledOnce();
  });
  it("respects reduced motion without creating controls", async () => {
    vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) });
    await messageHoldHaptic();
    expect(library.create).not.toHaveBeenCalled();
  });
  it("cleans up denied feedback without interrupting the menu", async () => {
    library.trigger.mockRejectedValue(new Error("Denied"));
    await expect(messageHoldHaptic()).resolves.toBeUndefined();
    expect(library.destroy).toHaveBeenCalledOnce();
  });
});
