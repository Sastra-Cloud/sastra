import { describe, expect, it } from "vitest";

import {
  DEFAULT_AGENT_LOGIN_REDIRECT,
  isDevAgentLoginPath,
  hasDevAgentLoginConfig,
  safeDevAgentRedirect,
} from "./agent-login";

describe("agent-browser dev login guards", () => {
  it("allows only the exact dev login path in development", () => {
    expect(
      isDevAgentLoginPath("/api/dev/agent-login", { NODE_ENV: "development" })
    ).toBe(true);
    expect(
      isDevAgentLoginPath("/api/dev/agent-login/extra", {
        NODE_ENV: "development",
      })
    ).toBe(false);
    expect(
      isDevAgentLoginPath("/api/dev/agent-login", { NODE_ENV: "production" })
    ).toBe(false);
  });

  it("requires all dev login env values", () => {
    expect(
      hasDevAgentLoginConfig({
        AGENT_BROWSER_DEV_TOKEN: "token",
        AGENT_BROWSER_DEV_EMAIL: "agent@example.com",
        AGENT_BROWSER_DEV_PASSWORD: "password",
      })
    ).toBe(true);
    expect(
      hasDevAgentLoginConfig({
        AGENT_BROWSER_DEV_TOKEN: "token",
        AGENT_BROWSER_DEV_EMAIL: "agent@example.com",
      })
    ).toBe(false);
  });

  it("keeps redirects same-origin and relative", () => {
    expect(safeDevAgentRedirect("/projects?view=active#top")).toBe(
      "/projects?view=active#top"
    );
    expect(safeDevAgentRedirect("https://evil.example")).toBe(
      DEFAULT_AGENT_LOGIN_REDIRECT
    );
    expect(safeDevAgentRedirect("//evil.example/path")).toBe(
      DEFAULT_AGENT_LOGIN_REDIRECT
    );
    expect(safeDevAgentRedirect(null)).toBe(DEFAULT_AGENT_LOGIN_REDIRECT);
  });
});
