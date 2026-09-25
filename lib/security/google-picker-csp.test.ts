import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";

describe("Google Picker content security policy", () => {
  it("allows the Picker script, API requests, frame, and file icons", async () => {
    const rules = await nextConfig.headers?.();
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
});
