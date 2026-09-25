import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

import { isDevAgentLoginPath } from "@/lib/dev/agent-login";

// Paths reachable without a session. Everything else requires login.
const PUBLIC_PREFIXES = [
  "/login",
  "/invite",
  "/forgot-password",
  "/reset-password",
  "/unsubscribe",
  "/api/unsubscribe", // token-authorized one-click unsubscribe
  "/api/auth",
  "/api/cron", // protected by CRON_SECRET, not a session
  "/api/security/dependency-status", // protected by its webhook secret
  // Inbound email webhooks: signed with INBOUND_WEBHOOK_SECRET (generic) or
  // RESEND_WEBHOOK_SECRET (Resend's Svix headers), verified in the route.
  "/api/email/inbound",
  "/api/health", // container healthcheck (liveness)
  "/api/ready", // deploy-time readiness (database, schema, bootstrap)
  "/api/internal/management", // control plane; HMAC-signed, 404 when self-hosted
  // PWA assets must load without a session — the browser fetches the manifest
  // WITHOUT credentials, and the service worker registers before login.
  "/manifest.webmanifest",
  "/sw.js",
  "/offline",
];

function isPublic(pathname: string) {
  if (isDevAgentLoginPath(pathname)) return true;
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  let response: NextResponse;

  if (isPublic(pathname)) {
    response = NextResponse.next();
  } else {
    // Optimistic cookie check (no DB hit); real verification happens in layouts.
    const sessionCookie = getSessionCookie(request);
    if (!sessionCookie) {
      const url = new URL("/login", request.url);
      if (pathname !== "/") url.searchParams.set("redirect", pathname);
      response = NextResponse.redirect(url);
    } else {
      response = NextResponse.next();
    }
  }

  // Baseline security headers on every response.
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-DNS-Prefetch-Control", "off");
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload"
    );
  }

  return response;
}

export const config = {
  matcher: [
    // Run on everything except Next internals and static asset files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
