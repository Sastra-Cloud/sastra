import { describe, expect, it } from "vitest";

import { matchingSatisfiedRightsTask } from "./task-reconciliation";

describe("matchingSatisfiedRightsTask", () => {
  it("matches one holder-specific legacy rights task", () => {
    expect(
      matchingSatisfiedRightsTask(
        [
          { id: "1", title: "Get rights from Crossway", phaseName: null },
          { id: "2", title: "Translate chapter 1", phaseName: "Translation" },
        ],
        { step: "license", holderName: "Crossway" }
      )?.id
    ).toBe("1");
  });

  it("refuses a holder mismatch or ambiguous candidates", () => {
    expect(
      matchingSatisfiedRightsTask(
        [{ id: "1", title: "Get rights from another publisher", phaseName: "Rights" }],
        { step: "license", holderName: "Crossway" }
      )
    ).toBeNull();
    expect(
      matchingSatisfiedRightsTask(
        [
          { id: "1", title: "Get rights from Crossway", phaseName: null },
          { id: "2", title: "Obtain license from Crossway", phaseName: "Rights" },
        ],
        { step: "license", holderName: "Crossway" }
      )
    ).toBeNull();
  });
});
