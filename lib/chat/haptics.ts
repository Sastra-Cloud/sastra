import { WebHaptics } from "web-haptics";

/** One quiet confirmation, including the library's Safari switch fallback. */
export async function messageHoldHaptic() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  try {
    const haptics = new WebHaptics({ debug: false, showSwitch: false });
    try { await haptics.trigger(10, { intensity: 1 }); }
    finally { haptics.destroy(); }
  } catch { /* Feedback must never prevent the message menu from opening. */ }
}
