import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TimezoneControl } from "./timezone-control";

describe("timezone hydration", () => {
  it("does not embed the server's potentially different IANA list in hydrated markup", () => {
    const zones = vi.spyOn(Intl, "supportedValuesOf");
    try {
      const html = renderToString(<TimezoneControl id="zone" defaultValue="US/Pacific" />);
      expect(zones).not.toHaveBeenCalled();
      expect(html).toContain('value="US/Pacific"');
      expect(html).toContain('value="UTC"');
      expect(html).toContain('name="timezone"');
    } finally { zones.mockRestore(); }
  });
});
