/* Sastra service worker — installable PWA + Web Push.
 * Minimal offline (network-first navigations + an offline fallback); NO caching
 * of authenticated content. Push handlers follow the iOS rules in PWAPUSH.md.
 */
const OFFLINE_URL = "/offline";
const CACHE = "sastra-offline-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.add(OFFLINE_URL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// Network-first for page navigations; fall back to the offline page when truly
// offline. Everything else passes straight through (no stale authed content).
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(async () => (await caches.match(OFFLINE_URL)) || Response.error())
    );
  }
});

// Push — ALWAYS results in showNotification() (iOS revokes the subscription after
// ~3 silent pushes), so the whole handler has a guaranteed fallback.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = data.title || "Sastra";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    // Monochrome status-bar glyph (Android). This is NOT the home-screen icon
    // count — that is the Badging API, handled by updateAppBadge() below.
    badge: "/icons/badge-96.png",
    tag: data.tag || data.url || "sastra",
    renotify: Boolean(data.tag),
    data: { url: data.url || "/dashboard" },
  };
  event.waitUntil(
    Promise.all([
      updateAppBadge(data.unread),
      self.registration.showNotification(title, options).catch(() =>
        self.registration.showNotification("Sastra", {
          body: "You have a new notification",
          icon: "/icons/icon-192.png",
          data: { url: "/dashboard" },
        })
      ),
    ])
  );
});

// Reflect the unread count on the installed-app icon. Feature-detected, so it is
// a silent no-op where the Badging API is unavailable (older iOS, Firefox) and
// never blocks the notification itself. Works on iOS 16.4+ and Chrome
// (Android/desktop); the count is supplied in the push payload as `unread`.
function updateAppBadge(count) {
  if (
    typeof count !== "number" ||
    !self.navigator ||
    !("setAppBadge" in self.navigator)
  ) {
    return Promise.resolve();
  }
  const n = Math.max(0, Math.floor(count));
  const p = n === 0 ? self.navigator.clearAppBadge() : self.navigator.setAppBadge(n);
  return Promise.resolve(p).catch(() => {});
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const c of clients) {
        if (c.url.includes(self.location.origin)) {
          await c.focus();
          if ("navigate" in c) c.navigate(url).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});

// The browser can rotate/expire the subscription with no app open. Re-subscribe
// and re-register using same-origin cookie auth (no JWT needed on our stack).
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const appKey =
          event.oldSubscription &&
          event.oldSubscription.options &&
          event.oldSubscription.options.applicationServerKey;
        const sub =
          event.newSubscription ||
          (await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: appKey,
          }));
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(sub.toJSON()),
        });
      } catch {
        /* best-effort */
      }
    })()
  );
});
