import "server-only";
import * as oidc from "openid-client";
import { openSecret } from "@/lib/crypto/secret-box";
import { integrationOrigin, integrationRequest } from "./protocol/transport";

/** Pinned, bounded transport applies the same DNS/SSRF rules to discovery and JWKS. */
export async function lectioOidcConfiguration(client: { issuer: string; clientId: string; secret: string }) {
  const issuer = new URL(client.issuer);
  const origin = integrationOrigin(issuer.origin);
  if (issuer.href !== `${origin}/api/auth`) throw new Error("Unexpected Lectio issuer.");
  const config = await oidc.discovery(issuer, client.clientId, openSecret(client.secret), oidc.ClientSecretPost(), {
    [oidc.customFetch]: async (input, init) => {
      const url = new URL(input);
      if (url.origin !== origin || !url.pathname.startsWith("/api/auth/")) throw new Error("Unexpected identity endpoint.");
      const headers = Object.fromEntries(new Headers(init?.headers).entries());
      const body = init?.body instanceof URLSearchParams ? init.body.toString() : init?.body;
      if (body !== undefined && body !== null && typeof body !== "string") throw new Error("Unsupported identity request.");
      const response = await integrationRequest(origin, url.pathname + url.search, { method: init?.method,
        headers, body: body ?? undefined, maxBytes: 256 * 1024 });
      if (response.status >= 300 && response.status < 400) throw new Error("Identity redirects are not allowed.");
      return new Response(new Uint8Array(response.body), { status: response.status, headers: { "content-type": "application/json" } });
    },
    execute: [oidc.enableNonRepudiationChecks, ...(issuer.protocol === "http:" ? [oidc.allowInsecureRequests] : [])],
  });
  for (const key of ["authorization_endpoint", "token_endpoint", "jwks_uri"] as const) {
    const endpoint = new URL(config.serverMetadata()[key] ?? "");
    if (endpoint.origin !== origin || !endpoint.pathname.startsWith("/api/auth/")) throw new Error("Unexpected identity endpoint.");
  }
  return config;
}
export function safeSsoReturnPath(value: unknown, fallback = "/dashboard"): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\r\n]/.test(value)) return fallback;
  try { const url = new URL(value, "https://sastra.invalid");
    return url.origin === "https://sastra.invalid" && !url.pathname.startsWith("/api/") && !url.pathname.startsWith("/login") ? url.pathname + url.search + url.hash : fallback;
  } catch { return fallback; }
}
