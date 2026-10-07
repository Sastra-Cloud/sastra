import { describe, expect, it } from "vitest";
import { supportConfiguration, supportRouteSummary } from "./config";
import { isHostedInstance } from "../hosted/mode";
describe("optional support enrollment", () => {
  it("does not enable hosted billing or require support for self-hosting", () => {
    expect(supportConfiguration({})).toBeNull();
    const env = {
      SASTRA_SUPPORT_URL: "https://support.example.invalid",
      SASTRA_SUPPORT_INSTANCE_ID: "internal",
      SASTRA_SUPPORT_SECRET: "secret",
    };
    expect(supportConfiguration(env)).not.toBeNull();
    expect(isHostedInstance(env)).toBe(false);
  });
  it("rejects malformed, credential-bearing, and insecure production URLs", () => {
    const env = {
      SASTRA_SUPPORT_URL: "https://support.example.invalid",
      SASTRA_SUPPORT_INSTANCE_ID: "internal",
      SASTRA_SUPPORT_SECRET: "secret",
      NODE_ENV: "production",
    };
    expect(
      supportConfiguration({
        ...env,
        SASTRA_SUPPORT_URL: "http://localhost:8790",
      }),
    ).toBeNull();
    expect(
      supportConfiguration({
        ...env,
        SASTRA_SUPPORT_URL: "https://user:pass@example.invalid",
      }),
    ).toBeNull();
    expect(
      supportConfiguration({ ...env, SASTRA_SUPPORT_SECRET: "" }),
    ).toBeNull();
  });
  it("removes query strings, hashes and numeric IDs from diagnostics", () => {
    expect(supportRouteSummary("/projects/123?secret=value#fragment")).toBe(
      "/projects/:id",
    );
  });
});
