import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class Script extends EventTarget {
  src = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  remove = vi.fn();
}

let scripts: Script[];
let frames: EventTarget[];
let client: typeof import("./google-picker-client");
const actions = { PICKED: "picked", CANCEL: "cancel", ERROR: "error" };

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  scripts = [];
  frames = [];
  vi.stubGlobal("window", {});
  vi.stubGlobal("document", {
    createElement: () => new Script(),
    body: { appendChild: (script: Script) => scripts.push(script) },
    querySelectorAll: () => frames,
  });
  vi.stubGlobal("MutationObserver", class {
    observe() {}
    disconnect() {}
  });
  client = await import("./google-picker-client");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function sdkReady() {
  window.google = { picker: { Action: actions } };
  window.gapi = { load: vi.fn((_name, options) => options.callback()) };
}

function pickerBuilder() {
  let callback: (data: { action: string; docs?: unknown[] }) => void;
  const frame = new EventTarget();
  const picker = { setVisible: vi.fn(), dispose: vi.fn() };
  const builder = {
    setCallback: vi.fn((handler) => { callback = handler; return builder; }),
    build: () => { frames.push(frame); return picker; },
  };
  return { builder, frame, picker, send: (data: Parameters<typeof callback>[0]) => callback(data) };
}

describe("Google Picker SDK loading", () => {
  it("shares a cold load between buttons and waits for the picker module", async () => {
    const first = client.loadGooglePicker();
    expect(client.loadGooglePicker()).toBe(first);
    expect(scripts).toHaveLength(1);
    sdkReady();
    scripts[0].onload?.();
    await expect(first).resolves.toBeUndefined();
    expect(window.gapi.load).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("times out api.js itself, removes it, and permits a fresh retry", async () => {
    const first = expect(client.loadGooglePicker()).rejects.toThrow("too long");
    await vi.advanceTimersByTimeAsync(15_000);
    await first;
    expect(scripts[0].remove).toHaveBeenCalledOnce();
    const retry = client.loadGooglePicker();
    expect(scripts).toHaveLength(2);
    sdkReady();
    scripts[1].onload?.();
    await expect(retry).resolves.toBeUndefined();
  });

  it("allows retry after a script error or module timeout", async () => {
    const failedScript = expect(client.loadGooglePicker()).rejects.toThrow("failed");
    scripts[0].onerror?.();
    await failedScript;
    let moduleTimeout: () => void = () => {};
    window.gapi = { load: (_name: string, options: { ontimeout: () => void }) => { moduleTimeout = options.ontimeout; } };
    const failedModule = expect(client.loadGooglePicker()).rejects.toThrow("too long");
    moduleTimeout();
    await failedModule;
    sdkReady();
    await expect(client.loadGooglePicker()).resolves.toBeUndefined();
  });

  it("starts token refresh alongside the SDK and bounds a stalled refresh", async () => {
    const getToken = vi.fn(() => new Promise<string>(() => {}));
    const result = expect(client.prepareGooglePicker(getToken, new AbortController().signal)).rejects.toThrow("too long");
    expect(getToken).toHaveBeenCalledOnce();
    expect(scripts).toHaveLength(1);
    sdkReady();
    scripts[0].onload?.();
    await vi.advanceTimersByTimeAsync(15_000);
    await result;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels preparation immediately without waiting for the token", async () => {
    sdkReady();
    const controller = new AbortController();
    const pending = client.prepareGooglePicker(() => new Promise(() => {}), controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("Google Picker window lifecycle", () => {
  beforeEach(sdkReady);

  function open() {
    const mock = pickerBuilder();
    const controller = new AbortController();
    const onPicked = vi.fn();
    const onError = vi.fn();
    const pending = client.showGooglePicker(mock.builder, { signal: controller.signal, onPicked, onError });
    return { ...mock, controller, onPicked, onError, pending };
  }

  it("keeps opening pending through setVisible and settles on iframe load", async () => {
    const session = open();
    const settled = vi.fn();
    void session.pending.then(settled);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    expect(session.picker.setVisible).toHaveBeenCalledWith(true);
    session.frame.dispatchEvent(new Event("load"));
    await session.pending;
    expect(settled).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    session.send({ action: actions.PICKED, docs: [{ id: "selected-file" }] });
    await Promise.resolve();
    expect(session.onPicked).toHaveBeenCalledWith({ action: "picked", docs: [{ id: "selected-file" }] });
    expect(session.picker.dispose).toHaveBeenCalledOnce();
  });

  it("removes a blank stalled picker and allows the next attempt to load", async () => {
    const session = open();
    const failed = expect(session.pending).rejects.toThrow("too long");
    await vi.advanceTimersByTimeAsync(20_000);
    await failed;
    expect(session.picker.dispose).toHaveBeenCalledOnce();
    session.send({ action: actions.PICKED, docs: [{ id: "late" }] });
    expect(session.onPicked).not.toHaveBeenCalled();
    const retry = open();
    retry.frame.dispatchEvent(new Event("load"));
    await expect(retry.pending).resolves.toBeUndefined();
    retry.controller.abort();
  });

  it("handles Google errors both before and after the iframe loads", async () => {
    const first = open();
    const failed = expect(first.pending).rejects.toThrow("reported an error");
    first.send({ action: actions.ERROR });
    await failed;
    const second = open();
    second.frame.dispatchEvent(new Event("load"));
    await second.pending;
    second.send({ action: actions.ERROR });
    expect(second.onError).toHaveBeenCalledOnce();
    expect(second.picker.dispose).toHaveBeenCalledOnce();
  });

  it.each(["cancel", "abort"])("cleans up %s without selecting files or showing an error", async (method) => {
    const session = open();
    if (method === "cancel") session.send({ action: actions.CANCEL });
    else session.controller.abort();
    await expect(session.pending).resolves.toBeUndefined();
    session.send({ action: actions.PICKED });
    expect(session.onPicked).not.toHaveBeenCalled();
    expect(session.onError).not.toHaveBeenCalled();
    expect(session.picker.dispose).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
