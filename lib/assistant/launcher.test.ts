import { describe, expect, it } from "vitest";

import { ASSISTANT_TIP_KEY, showAssistantTip } from "./launcher";

const dismissed =
  (...keys: string[]) =>
  (key: string) =>
    keys.includes(key);

describe("showAssistantTip", () => {
  it("shows the tip to someone new while guidance is on", () => {
    expect(
      showAssistantTip({
        introduced: false,
        guidanceEnabled: true,
        isDismissed: dismissed(),
      })
    ).toBe(true);
  });

  it("respects the guidance switch", () => {
    expect(
      showAssistantTip({
        introduced: false,
        guidanceEnabled: false,
        isDismissed: dismissed(),
      })
    ).toBe(false);
  });

  it("stays hidden once the tip is hidden or the assistant is opened", () => {
    expect(
      showAssistantTip({
        introduced: false,
        guidanceEnabled: true,
        isDismissed: dismissed(ASSISTANT_TIP_KEY),
      })
    ).toBe(false);
  });

  it("skips people who already use the assistant", () => {
    expect(
      showAssistantTip({
        introduced: true,
        guidanceEnabled: true,
        isDismissed: dismissed(),
      })
    ).toBe(false);
  });
});
