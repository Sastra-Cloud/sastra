import { timingSafeEqual } from "node:crypto";

import { splitSetCookieHeader } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth/auth";
import {
  hasDevAgentLoginConfig,
  safeDevAgentRedirect,
} from "@/lib/dev/agent-login";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unavailable() {
  return new NextResponse("Not found", {
    status: 404,
    headers: { "cache-control": "no-store" },
  });
}

function secureEquals(a: string | undefined, b: string | null) {
  if (!a || !b) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function presentedToken(request: NextRequest) {
  const headerToken = request.headers.get("x-agent-browser-dev-token");
  if (headerToken) return headerToken;

  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }

  return null;
}

function setCookieHeaders(headers: Headers) {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] })
    .getSetCookie;
  if (typeof getSetCookie === "function") return getSetCookie.call(headers);
  return splitSetCookieHeader(headers.get("set-cookie") ?? "");
}

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") return unavailable();

  if (!hasDevAgentLoginConfig()) return unavailable();
  const token = process.env.AGENT_BROWSER_DEV_TOKEN!;
  const email = process.env.AGENT_BROWSER_DEV_EMAIL!;
  const password = process.env.AGENT_BROWSER_DEV_PASSWORD!;

  if (!secureEquals(token, presentedToken(request))) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "cache-control": "no-store" } }
    );
  }

  let signInResponse: Response;
  try {
    signInResponse = await auth.api.signInEmail({
      body: { email, password, rememberMe: false },
      headers: request.headers,
      asResponse: true,
    });
  } catch {
    return NextResponse.json(
      { error: "Agent browser dev login failed." },
      { status: 401, headers: { "cache-control": "no-store" } }
    );
  }

  if (!signInResponse.ok) {
    return NextResponse.json(
      { error: "Agent browser dev login failed." },
      { status: 401, headers: { "cache-control": "no-store" } }
    );
  }

  const redirectTo = safeDevAgentRedirect(
    request.nextUrl.searchParams.get("redirect")
  );
  const response = NextResponse.redirect(new URL(redirectTo, request.nextUrl));
  response.headers.set("cache-control", "no-store");

  for (const cookie of setCookieHeaders(signInResponse.headers)) {
    response.headers.append("set-cookie", cookie);
  }

  return response;
}
