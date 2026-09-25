import { describe, expect, it } from "vitest";

import {
  NO_PROJECT_EVIDENCE,
  candidateOptionLabel,
  shouldSkipKnownProjectMatch,
} from "./known-project-jev";
import { shouldSkipRightsReview } from "./rights-review-jev";
import {
  ACTIONABLE_SKIP_MAX,
  shouldSkipTaskExtraction,
  sweepActionableSkipThreshold,
  type SweepCase,
} from "./task-suggestions-jev";

describe("shouldSkipTaskExtraction", () => {
  it("skips forwarded mail with no actionable request", () => {
    expect(shouldSkipTaskExtraction({ hasActionableRequest: { noul: 0.04 } })).toBe(
      true
    );
  });

  it("extracts whenever a request is plausible", () => {
    expect(shouldSkipTaskExtraction({ hasActionableRequest: { noul: 0.25 } })).toBe(
      false
    );
    expect(shouldSkipTaskExtraction({ hasActionableRequest: { noul: 0.9 } })).toBe(
      false
    );
  });

  it("extracts when the judgment is unavailable or unusable", () => {
    expect(shouldSkipTaskExtraction(null)).toBe(false);
    expect(shouldSkipTaskExtraction(undefined)).toBe(false);
    expect(
      shouldSkipTaskExtraction({ hasActionableRequest: { noul: Number.NaN } })
    ).toBe(false);
  });
});

describe("shouldSkipKnownProjectMatch", () => {
  it("skips the tie-breaker on a confident 'no project indicated'", () => {
    expect(
      shouldSkipKnownProjectMatch({
        indicatedProject: { choice: NO_PROJECT_EVIDENCE, confidence: 0.93 },
      })
    ).toBe(true);
  });

  it("runs the tie-breaker when a candidate is indicated", () => {
    expect(
      shouldSkipKnownProjectMatch({
        indicatedProject: { choice: candidateOptionLabel(1), confidence: 0.99 },
      })
    ).toBe(false);
  });

  it("runs the tie-breaker when the 'none' answer is not confident", () => {
    expect(
      shouldSkipKnownProjectMatch({
        indicatedProject: { choice: NO_PROJECT_EVIDENCE, confidence: 0.6 },
      })
    ).toBe(false);
  });

  it("runs the tie-breaker when the judgment is unavailable", () => {
    expect(shouldSkipKnownProjectMatch(null)).toBe(false);
    expect(shouldSkipKnownProjectMatch(undefined)).toBe(false);
  });

  it("labels candidates by position, keeping ids out of the prompt", () => {
    expect(candidateOptionLabel(0)).toBe("project_0");
    expect(candidateOptionLabel(3)).toBe("project_3");
  });
});

describe("shouldSkipRightsReview", () => {
  it("skips only when the email clearly rules the document out", () => {
    expect(
      shouldSkipRightsReview({ looksLikeRightsDocument: { noul: 0.03 } })
    ).toBe(true);
  });

  it("reviews on any real doubt, since the document itself is unseen", () => {
    expect(
      shouldSkipRightsReview({ looksLikeRightsDocument: { noul: 0.15 } })
    ).toBe(false);
    expect(
      shouldSkipRightsReview({ looksLikeRightsDocument: { noul: 0.4 } })
    ).toBe(false);
  });

  it("reviews when the judgment is unavailable or unusable", () => {
    expect(shouldSkipRightsReview(null)).toBe(false);
    expect(shouldSkipRightsReview(undefined)).toBe(false);
    expect(
      shouldSkipRightsReview({ looksLikeRightsDocument: { noul: Number.NaN } })
    ).toBe(false);
  });
});

/**
 * These cover the sweep arithmetic only. They say nothing about whether
 * ACTIONABLE_SKIP_MAX is the right number for real mail — only the live eval
 * (`pnpm eval:jev`) against production cases can answer that.
 */
describe("sweepActionableSkipThreshold", () => {
  const thresholds = [0.1, 0.25, 0.5];

  it("reports nothing skipped for an empty case set", () => {
    for (const point of sweepActionableSkipThreshold([], thresholds)) {
      expect(point.skipped).toBe(0);
      expect(point.falseNegatives).toBe(0);
      expect(point.skipRate).toBe(0);
    }
  });

  it("keeps a probability exactly equal to the threshold", () => {
    const cases: SweepCase[] = [{ noul: 0.25, isRealTask: true }];
    const [point] = sweepActionableSkipThreshold(cases, [0.25]);
    expect(point.skipped).toBe(0);
    expect(point.falseNegatives).toBe(0);
    // Matches the strict `<` the production gate uses.
    expect(shouldSkipTaskExtraction({ hasActionableRequest: { noul: 0.25 } })).toBe(
      false
    );
  });

  it("counts a real task as a false negative only above its probability", () => {
    const cases: SweepCase[] = [{ noul: 0.2, isRealTask: true }];
    const [low, high] = sweepActionableSkipThreshold(cases, [0.15, 0.3]);
    expect(low.falseNegatives).toBe(0);
    expect(high.falseNegatives).toBe(1);
  });

  it("separates real tasks from noise across a sweep", () => {
    const cases: SweepCase[] = [
      { noul: 0.02, isRealTask: false },
      { noul: 0.05, isRealTask: false },
      { noul: 0.2, isRealTask: false },
      { noul: 0.4, isRealTask: true },
      { noul: 0.95, isRealTask: true },
    ];
    const [tight, shipped, loose] = sweepActionableSkipThreshold(cases, thresholds);

    expect(tight.skipped).toBe(2);
    expect(tight.falseNegatives).toBe(0);

    expect(shipped.skipped).toBe(3);
    expect(shipped.falseNegatives).toBe(0);
    expect(shipped.skipRate).toBeCloseTo(0.6, 5);

    // Pushed past a real task, the threshold starts losing work.
    expect(loose.falseNegatives).toBe(1);
  });

  it("flags the shipped constant when a real task scores below it", () => {
    const cases: SweepCase[] = [{ noul: 0.1, isRealTask: true }];
    const [shipped] = sweepActionableSkipThreshold(cases, [ACTIONABLE_SKIP_MAX]);
    expect(shipped.falseNegatives).toBe(1);
  });
});
