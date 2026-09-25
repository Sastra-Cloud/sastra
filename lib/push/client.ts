"use client";

/** Browser-side Web Push helpers (subscribe is idempotent; iOS-safe timeouts). */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    VAPID_PUBLIC_KEY.length > 0
  );
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS 13+ reports as Mac; detect touch + Safari
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** Current Notification permission, or null when the API is unavailable. */
export function permissionState(): NotificationPermission | null {
  if (typeof Notification === "undefined") return null;
  return Notification.permission;
}

/**
 * Reflect an unread count on the installed-app (PWA) icon via the Badging API.
 * Cross-platform and feature-detected: works on iOS 16.4+ and Chrome
 * (Android/desktop), and is a silent no-op elsewhere. The service worker sets
 * the badge when a push arrives; this keeps it honest from the foreground as the
 * user reads items (setting 0 clears it). iOS only shows the badge once
 * notification permission is granted; a rejected promise is ignored.
 */
export function setAppBadge(count: number): void {
  if (typeof navigator === "undefined" || !("setAppBadge" in navigator)) return;
  const nav = navigator as unknown as {
    setAppBadge: (count?: number) => Promise<void>;
    clearAppBadge: () => Promise<void>;
  };
  const n = Math.max(0, Math.floor(count));
  const p = n === 0 ? nav.clearAppBadge() : nav.setAppBadge(n);
  void Promise.resolve(p).catch(() => {});
}

/** Whether this browser currently has an active push subscription. */
export async function currentEndpoint(): Promise<string | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub?.endpoint ?? null;
}

/** Subscribe (idempotent) + register with the server. Returns the endpoint. */
export async function enablePush(): Promise<string> {
  if (!pushSupported()) throw new Error("Push not supported on this device.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Permission denied.");

  // iOS: navigator.serviceWorker.ready can hang — race a timeout.
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<ServiceWorkerRegistration>((_, rej) =>
      setTimeout(() => rej(new Error("Service worker timed out.")), 10_000)
    ),
  ]);

  // subscribe() is idempotent — returns the existing sub if still valid.
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  if (!res.ok) throw new Error("Could not register with the server.");
  return sub.endpoint;
}

/**
 * Re-register the existing local subscription with the server (idempotent, and
 * fire-and-forget). Heals client/server drift after the server prunes a dead or
 * failed subscription: the browser still thinks it is subscribed, so we re-POST
 * it — the upsert also refreshes `lastSeenAt`, keeping the device list honest.
 * Does nothing (and never throws) when there is no local subscription.
 */
export async function syncSubscription(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    });
  } catch {
    /* best-effort: drift heals on the next enable or session */
  }
}

/** Unsubscribe this browser + tell the server to forget it. */
export async function disablePush(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await fetch("/api/push/unsubscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}
