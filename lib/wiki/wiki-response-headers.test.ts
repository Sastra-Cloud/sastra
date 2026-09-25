import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";

describe("Wiki response headers", () => {
  it("allows external players to receive the site origin", async () => {
    const rules = await nextConfig.headers?.();
    const wikiRule = rules?.find((rule) => rule.source === "/wiki/:path*");

    expect(wikiRule?.headers).toContainEqual({
      key: "Referrer-Policy",
      value: "strict-origin-when-cross-origin",
    });
  });
});
