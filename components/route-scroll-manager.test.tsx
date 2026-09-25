import { describe, expect, it } from "vitest";

import { shouldResetScrollAfterNavigation } from "./route-scroll-manager";

describe("authenticated route scroll policy", () => {
  it("resets forward navigation to a different screen", () => {
    expect(
      shouldResetScrollAfterNavigation({
        previousPathname: "/projects",
        pathname: "/settings/profile",
        historyTargetPathname: null,
        hash: "",
      })
    ).toBe(true);
  });

  it("preserves Back and Forward scroll restoration", () => {
    expect(
      shouldResetScrollAfterNavigation({
        previousPathname: "/settings/profile",
        pathname: "/projects",
        historyTargetPathname: "/projects",
        hash: "",
      })
    ).toBe(false);
  });

  it("preserves hash targets and same-screen updates", () => {
    expect(
      shouldResetScrollAfterNavigation({
        previousPathname: "/projects",
        pathname: "/help",
        historyTargetPathname: null,
        hash: "#tasks",
      })
    ).toBe(false);
    expect(
      shouldResetScrollAfterNavigation({
        previousPathname: "/projects",
        pathname: "/projects",
        historyTargetPathname: null,
        hash: "",
      })
    ).toBe(false);
  });
});
