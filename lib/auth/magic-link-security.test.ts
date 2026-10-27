import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it, vi } from "vitest";

const { sendMagicLinkEmail } = vi.hoisted(() => ({
  sendMagicLinkEmail: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/email/magic-link", () => ({ sendMagicLinkEmail }));

import { auth as configuredAuth } from "./auth";

describe("magic-link verification isolation", () => {
  it("rejects an OAuth state as a login token while accepting a real emailed link once", async () => {
    const baseURL = "http://localhost:3243";
    const email = "member@example.test";
    const now = new Date();
    const store = {
      user: [{ id: "member", name: "Member", email, emailVerified: true, role: "member", isActive: true, createdAt: now, updatedAt: now }],
      account: [], session: [], verification: [],
    };
    const auth = betterAuth({
      ...configuredAuth.options,
      baseURL,
      secret: "local-regression-test-secret-at-least-32-characters",
      database: memoryAdapter(store),
      rateLimit: { enabled: false },
      socialProviders: { google: { clientId: "test-client", clientSecret: "test-secret" } },
    });
    const oauth = await auth.handler(new Request(`${baseURL}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: baseURL },
      body: JSON.stringify({ provider: "google", disableRedirect: true, additionalData: { email } }),
    }));
    expect(oauth.status).toBe(200);
    const { url } = await oauth.json();
    const state = new URL(url).searchParams.get("state");
    expect(state).toBeTruthy();
    const attack = await auth.handler(new Request(`${baseURL}/api/auth/magic-link/verify?token=${encodeURIComponent(state!)}`));
    expect(store.session).toHaveLength(0);
    expect(new URL(attack.headers.get("location")!).searchParams.get("error")).toBe("INVALID_TOKEN");

    const requested = await auth.handler(new Request(`${baseURL}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: baseURL },
      body: JSON.stringify({ email, callbackURL: "/dashboard" }),
    }));
    expect(requested.status).toBe(200);
    expect(sendMagicLinkEmail).toHaveBeenCalledOnce();
    const emailedURL = sendMagicLinkEmail.mock.calls[0][0].url as string;
    const valid = await auth.handler(new Request(emailedURL));
    expect(valid.headers.get("location")).toBe(`${baseURL}/dashboard`);
    expect(store.session).toHaveLength(1);
    const replay = await auth.handler(new Request(emailedURL));
    expect(new URL(replay.headers.get("location")!).searchParams.get("error")).toBe("INVALID_TOKEN");
    expect(store.session).toHaveLength(1);
  });
});
