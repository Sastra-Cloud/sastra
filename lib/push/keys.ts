/**
 * Web Push keys are read at runtime, so a prebuilt image (Docker, Sastra Cloud)
 * turns push on through environment variables alone, with no rebuild.
 *
 * `VAPID_PUBLIC_KEY` is the preferred name; the older
 * `NEXT_PUBLIC_VAPID_PUBLIC_KEY` still works. The older name is read through a
 * computed key on purpose: Next.js replaces `process.env.NEXT_PUBLIC_*` with its
 * build-time value, which is empty in published images.
 */
const LEGACY_PUBLIC_KEY_NAME = "NEXT_PUBLIC_VAPID_PUBLIC_KEY";

export function vapidPublicKeyFromEnv(env: Record<string, string | undefined> = process.env): string {
  return env.VAPID_PUBLIC_KEY?.trim() || env[LEGACY_PUBLIC_KEY_NAME]?.trim() || "";
}
