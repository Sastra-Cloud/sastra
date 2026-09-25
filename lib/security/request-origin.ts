function addOrigin(origins: Set<string>, value: string | null | undefined) {
  if (!value) return;
  try {
    origins.add(new URL(value).origin);
  } catch {
    // Ignore malformed deployment headers and configuration values.
  }
}

function firstHeaderValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim() || null;
}

/**
 * Validate browser mutation origins when Next.js runs behind a reverse proxy.
 * Coolify forwards the public host separately while request.url may contain the
 * container's internal host, so both the configured and forwarded origins are
 * trusted alongside the direct request origin.
 */
export function hasTrustedRequestOrigin(request: Request) {
  const suppliedOrigin = request.headers.get("origin");
  if (!suppliedOrigin) return true;

  let normalizedOrigin: string;
  try {
    normalizedOrigin = new URL(suppliedOrigin).origin;
  } catch {
    return false;
  }

  const trustedOrigins = new Set<string>();
  addOrigin(trustedOrigins, request.url);
  addOrigin(trustedOrigins, process.env.BETTER_AUTH_URL);

  const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
  const requestHost = forwardedHost ?? firstHeaderValue(request.headers.get("host"));
  if (requestHost) {
    const forwardedProtocol = firstHeaderValue(request.headers.get("x-forwarded-proto"));
    const requestProtocol = new URL(request.url).protocol.replace(/:$/, "");
    addOrigin(trustedOrigins, `${forwardedProtocol ?? requestProtocol}://${requestHost}`);
  }

  return trustedOrigins.has(normalizedOrigin);
}
