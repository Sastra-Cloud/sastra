import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";

describe("Google Picker content security policy", () => {
  it("allows the Picker script, API requests, frame, and file icons", async () => {
    const rules = await nextConfig("phase-development-server").headers?.();
    const cspValues = ["/:path*", "/wiki/:path*"].map((source) =>
      rules
        ?.find((rule) => rule.source === source)
        ?.headers.find((header) => header.key === "Content-Security-Policy")
        ?.value
    );

    for (const csp of cspValues) {
      expect(csp).toContain(
        "script-src 'self' 'unsafe-inline' https://apis.google.com"
      );
      expect(csp).toContain("https://www.googleapis.com");
      expect(csp).toContain("frame-src 'self' https://docs.google.com");
      expect(csp).toContain("https://*.googleusercontent.com");
      expect(csp).toContain("https://*.gstatic.com");
    }
  });

  it("permits Next development modules without relaxing production script execution", async () => {
    for (const phase of ["phase-development-server", "phase-production-build", "phase-production-server"]) {
      const rules = await nextConfig(phase).headers?.();
      const policies = rules?.flatMap(rule => rule.headers.filter(header => header.key === "Content-Security-Policy").map(header => header.value));
      const appPolicy = rules?.find(rule => rule.source === "/:path*")?.headers.find(header => header.key === "Content-Security-Policy")?.value;
      expect(appPolicy).toContain("'wasm-unsafe-eval'"); // AAC fallback; JavaScript eval stays development-only below.
      expect(policies?.length).toBeGreaterThan(0);
      for (const policy of policies ?? []) {
        expect(policy.includes("'unsafe-eval'")).toBe(phase === "phase-development-server");
      }
    }
  });
});
