/**
 * Pure derivation of the push-notification setup state from browser signals.
 *
 * Kept free of `window`/`navigator` access so it is unit-testable (like
 * `lib/notifications/push-gate.ts`). The client hook gathers the raw signals and
 * feeds them in; the UI renders one panel per resting state.
 */

export type PushSetupState =
  | "detecting" // async signals not resolved yet
  | "unsupported" // no Push API (incl. iOS standalone < 16.4) and no install path
  | "ios-needs-install" // iOS in a browser tab — must add to Home Screen first
  | "denied" // Notification permission blocked — needs OS/browser recovery
  | "ready" // can subscribe now (permission "default", or "granted" w/o a sub)
  | "enabled"; // this device already has an active subscription

export type PushSetupInput = {
  /** `pushSupported()` — null until resolved (kept nullable for SSR/first paint). */
  supported: boolean | null;
  /** `isIOS()` — iPhone/iPad, including iPadOS-reports-as-Mac. */
  ios: boolean;
  /** `isStandalone()` — launched from the installed PWA. */
  standalone: boolean;
  /** `Notification.permission`, or null when the Notification API is absent. */
  permission: NotificationPermission | null;
  /** Whether this browser currently holds a push subscription — null while the
   *  async `currentEndpoint()` lookup is in flight. */
  hasEndpoint: boolean | null;
};

/**
 * Resolve the resting setup state. Order matters:
 *
 * 1. Unresolved async signals → `detecting` (avoids a flash of the wrong panel).
 * 2. A live local subscription always wins → `enabled`.
 * 3. iOS in a browser tab → `ios-needs-install` (push needs the standalone PWA),
 *    even though the in-tab Push API is unavailable.
 * 4. No Push API otherwise → `unsupported`. For iOS *standalone* this means the
 *    OS predates 16.4; the UI tailors that copy from `ios && standalone`.
 * 5. Permission blocked → `denied` (recovery instructions).
 * 6. Otherwise ready to subscribe.
 *
 * The `beforeinstallprompt`/install affordance is orthogonal — it never changes
 * the resting state (on Android, push can be enabled in a tab before install),
 * so it is surfaced separately by the hook, not derived here.
 */
export function derivePushSetupState(input: PushSetupInput): PushSetupState {
  if (input.supported === null || input.hasEndpoint === null) return "detecting";
  if (input.hasEndpoint) return "enabled";
  if (input.ios && !input.standalone) return "ios-needs-install";
  if (!input.supported) return "unsupported";
  if (input.permission === "denied") return "denied";
  return "ready";
}
