/**
 * The hostname this deployment answers on, from `BETTER_AUTH_URL`. Used for
 * generated identifiers (Message-ID domains, default sender addresses, VAPID
 * subject) so nothing hard-codes one organization's domain.
 */
export function appHostname(env: Record<string, string | undefined> = process.env): string {
  const url = env.BETTER_AUTH_URL?.trim();
  if (url) {
    try {
      const host = new URL(url).hostname;
      if (host) return host;
    } catch {
      /* fall through */
    }
  }
  return "localhost";
}
