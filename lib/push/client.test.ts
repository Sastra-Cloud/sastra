import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

function browser(permission: NotificationPermission = "default") {
  const notification = { permission, requestPermission: vi.fn().mockResolvedValue("granted") };
  const subscription = {
    endpoint: "https://push.example.test/device",
    toJSON: () => ({ endpoint: "https://push.example.test/device", keys: {} }),
  };
  const subscribe = vi.fn().mockResolvedValue(subscription);
  const navigator = {
    userAgent: SAFARI,
    platform: "MacIntel",
    maxTouchPoints: 0,
    serviceWorker: { ready: Promise.resolve({ pushManager: { subscribe } }) },
  };
  const fetch = vi.fn().mockImplementation(async (url: string) =>
    url === "/api/push/public-key"
      ? Response.json({ publicKey: "BAECAw" })
      : new Response(null, { status: 200 })
  );
  vi.stubGlobal("navigator", navigator);
  vi.stubGlobal("Notification", notification);
  vi.stubGlobal("window", { Notification: notification, PushManager: {}, matchMedia: () => ({ matches: false }) });
  vi.stubGlobal("fetch", fetch);
  return { notification, subscription, subscribe, navigator, fetch };
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Mac Safari detection", () => {
  it("recognizes desktop Safari, including its frozen macOS user agent", async () => {
    browser();
    expect((await import("./client")).isMacSafari()).toBe(true);
  });

  it.each([
    ["iPad reporting as Mac", SAFARI, 5],
    ["iPhone", "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) Version/26.0 Mobile/15E148 Safari/604.1", 5],
    ["Chrome on Mac", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/140.0 Safari/537.36", 0],
    ["Edge on Mac", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/140.0 Safari/537.36 Edg/140.0", 0],
    ["Firefox on Mac", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15) Gecko/20100101 Firefox/140.0", 0],
  ])("does not give the Mac Safari guide to %s", async (_name, ua, touchPoints) => {
    const { navigator } = browser();
    navigator.userAgent = ua;
    navigator.maxTouchPoints = touchPoints;
    expect((await import("./client")).isMacSafari()).toBe(false);
  });
});

describe("enablePush", () => {
  it("requests permission in the click stack even while public-key discovery is pending", async () => {
    const { notification, fetch, subscribe, subscription } = browser();
    const keyResponse = deferred<Response>();
    fetch.mockImplementation((url: string) => url === "/api/push/public-key"
      ? keyResponse.promise
      : Promise.resolve(new Response(null, { status: 200 })));
    const client = await import("./client");
    const key = client.pushPublicKey();

    const enabled = client.enablePush();
    // This assertion happens before yielding a microtask: Safari still has
    // the user gesture, despite a stalled network request for the public key.
    expect(notification.requestPermission).toHaveBeenCalledTimes(1);
    expect(subscribe).not.toHaveBeenCalled();

    keyResponse.resolve(Response.json({ publicKey: "BAECAw" }));
    await key;
    await expect(enabled).resolves.toBe(subscription.endpoint);
    expect(subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: expect.any(Uint8Array) });
    expect(fetch).toHaveBeenLastCalledWith("/api/push/subscribe", expect.objectContaining({ method: "POST" }));
  });

  it("does not report success before the server registers the subscription", async () => {
    const { fetch } = browser("granted");
    const saved = deferred<Response>();
    fetch.mockImplementation((url: string) => Promise.resolve(url === "/api/push/public-key"
      ? Response.json({ publicKey: "BAECAw" })
      : saved.promise));
    const client = await import("./client");
    let finished = false;
    const enabled = client.enablePush().then(() => { finished = true; });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(finished).toBe(false);
    saved.resolve(new Response(null, { status: 500 }));
    await expect(enabled).rejects.toThrow("Could not register with the server.");
    expect(finished).toBe(false);
  });

  it.each(["denied", "default"])("does not subscribe when permission is %s", async (permission) => {
    const { notification, subscribe, fetch } = browser();
    notification.requestPermission.mockResolvedValue(permission);
    await expect((await import("./client")).enablePush()).rejects.toThrow("Notifications were not allowed");
    expect(subscribe).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reuses granted permission without showing another native prompt", async () => {
    const { notification } = browser("granted");
    await (await import("./client")).enablePush();
    expect(notification.requestPermission).not.toHaveBeenCalled();
  });

  it("reports missing server configuration without attempting a subscription", async () => {
    const { fetch, subscribe } = browser("granted");
    fetch.mockResolvedValue(Response.json({ publicKey: "" }));
    await expect((await import("./client")).enablePush()).rejects.toThrow("Notifications are not set up");
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("ends a stalled Safari service-worker check instead of leaving setup detecting forever", async () => {
    vi.useFakeTimers();
    const { navigator } = browser();
    navigator.serviceWorker.ready = new Promise(() => {});
    const client = await import("./client");
    const check = expect(client.currentEndpoint()).rejects.toThrow("Reload Sastra and try again");
    await vi.advanceTimersByTimeAsync(10_000);
    await check;
  });
});
