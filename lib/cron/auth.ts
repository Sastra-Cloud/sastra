import "server-only";

import { timingSafeEqual } from "node:crypto";

/**
 * Cron routes are protected by the shared `CRON_SECRET` bearer token, not a
 * session. Constant-time comparison so the secret cannot be probed byte by byte.
 */
export function isCronRequestAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
