import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
describe("Web Haptics integration", () => {
  it("uses the Safari switch fallback silently and removes its hidden control", async () => {
    vi.resetModules();
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    const click = vi.fn(), remove = vi.fn(), append = vi.fn();
    const controls: Array<{ tag: string; style: Record<string, string>; setAttribute: ReturnType<typeof vi.fn> }> = [];
    vi.stubGlobal("document", {
      body: { appendChild: append },
      createElement(tag: string) {
        const element = { tag, style: {}, setAttribute: vi.fn(), appendChild: vi.fn(), click, remove };
        controls.push(element);
        return element;
      },
    });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 2));
    vi.stubGlobal("cancelAnimationFrame", clearTimeout);
    const { messageHoldHaptic } = await import("./haptics");
    await messageHoldHaptic();
    expect(controls.find(e => e.tag === "input")?.setAttribute).toHaveBeenCalledWith("switch", "");
    expect(controls.every(e => e.style.display === "none")).toBe(true);
    expect(click).toHaveBeenCalledOnce();
    expect(append).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
  });
  it("uses one native vibration when the API exists", async () => {
    vi.resetModules();
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    vi.stubGlobal("document", {});
    // The external ESM module caches this capability at its first import.
    const { WebHaptics } = await import("web-haptics");
    const supported = WebHaptics.isSupported;
    Object.defineProperty(WebHaptics, "isSupported", { value: true, configurable: true });
    const { messageHoldHaptic } = await import("./haptics");
    try {
      await messageHoldHaptic();
      expect(vibrate).toHaveBeenCalledExactlyOnceWith([10]);
    } finally { Object.defineProperty(WebHaptics, "isSupported", { value: supported }); }
  });
});
