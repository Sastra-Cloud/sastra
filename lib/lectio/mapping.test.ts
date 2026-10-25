import { expect, it } from "vitest";
import { mappedPhases } from "./mapping";
it("requires an explicit decision for every current workflow step before projecting task progress", () => {
  expect(() => mappedPhases([{ stepKey: "translate", phaseId: "phase" }], ["translate", "new-review"])).toThrow(/Review/);
  expect(() => mappedPhases([{ stepKey: "translate", phaseId: "phase" }, { stepKey: "translate", phaseId: "other" }], ["translate", "review"])).toThrow(/Review/);
  const result = mappedPhases([{ stepKey: "translate", phaseId: "phase" }, { stepKey: "review", phaseId: "phase" }, { stepKey: "prepare", phaseId: null }], ["prepare", "translate", "review"]);
  expect([...result]).toEqual([["phase", ["translate", "review"]]]);
});
