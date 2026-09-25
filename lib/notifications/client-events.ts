export const NOTIFICATIONS_CHANGED_EVENT = "sastra:notifications-changed";

/** Ask mounted notification surfaces to reconcile with the server now. */
export function requestNotificationRefresh() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}
