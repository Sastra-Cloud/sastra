import { describe, expect, it } from "vitest";

import {
  comparePrintFunding,
  isBookProjectKind,
  matchesPrintFundingFilter,
  needsPrintFundingReview,
  projectFundingBadgeInfo,
  type ProjectFundingSummary,
} from "./print-funding";

const summary = (
  values: Partial<ProjectFundingSummary> = {}
): ProjectFundingSummary => ({
  needed: 1_800,
  committed: 1_800,
  received: 900,
  spent: 0,
  printNeeded: 0,
  printSecured: 0,
  currency: "USD",
  ...values,
});

describe("print funding status", () => {
  it("treats legacy untyped projects as books", () => {
    expect(isBookProjectKind(null)).toBe(true);
    expect(isBookProjectKind("book")).toBe(true);
    expect(isBookProjectKind("article")).toBe(false);
  });

  it("keeps funded and print-not-required books out of the review queue", () => {
    expect(needsPrintFundingReview("not_assessed")).toBe(true);
    expect(needsPrintFundingReview("no_funding")).toBe(true);
    expect(needsPrintFundingReview("seeking_funding")).toBe(true);
    expect(needsPrintFundingReview("partially_funded")).toBe(true);
    expect(needsPrintFundingReview("funded")).toBe(false);
    expect(needsPrintFundingReview("not_required")).toBe(false);
  });

  it("filters the review queue to book projects", () => {
    expect(matchesPrintFundingFilter("book", "no_funding", "needs_review")).toBe(true);
    expect(matchesPrintFundingFilter(null, "not_assessed", "needs_review")).toBe(true);
    expect(matchesPrintFundingFilter("book", "funded", "needs_review")).toBe(false);
    expect(matchesPrintFundingFilter("article", "no_funding", "needs_review")).toBe(false);
  });

  it("sorts unassessed and unfunded books ahead of funded and non-book work", () => {
    const rows = [
      { kind: "article", printFundingStatus: "not_assessed" as const },
      { kind: "book", printFundingStatus: "funded" as const },
      { kind: "book", printFundingStatus: "no_funding" as const },
      { kind: "book", printFundingStatus: "not_assessed" as const },
    ].sort(comparePrintFunding);

    expect(rows.map((row) => row.printFundingStatus)).toEqual([
      "not_assessed",
      "no_funding",
      "funded",
      "not_assessed",
    ]);
    expect(rows.at(-1)?.kind).toBe("article");
  });

  it("uses recorded project funding while the print decision is unset", () => {
    expect(projectFundingBadgeInfo("not_assessed", summary())).toMatchObject({
      label: "Project fully promised · 50% received",
      compactLabel: "Project promised · 50% received",
      tone: "success",
    });
  });

  it("keeps an explicit no-print-funding decision visible", () => {
    expect(projectFundingBadgeInfo("no_funding", summary())).toMatchObject({
      label: "Print planned · no funding",
      tone: "danger",
    });
  });

  it("describes a deliberate current eBook-only plan", () => {
    expect(projectFundingBadgeInfo("not_required", summary())).toMatchObject({
      label: "No printing planned yet",
      tone: "neutral",
    });
  });

  it("uses whole-project coverage when no print-line amount is assigned", () => {
    expect(
      projectFundingBadgeInfo(
        "not_assessed",
        summary({
          received: 1_800,
          printNeeded: 1_530,
          printSecured: 0,
        })
      )
    ).toMatchObject({
      label: "Print covered · received",
      compactLabel: "Print covered · received",
      tone: "success",
    });
  });

  it("treats a fully received project MoU as covering its included print cost", () => {
    const info = projectFundingBadgeInfo(
      "not_assessed",
      summary({
        needed: 21_052,
        committed: 21_052,
        received: 21_052,
        printNeeded: 6_652,
        printSecured: 0,
      })
    );
    expect(info).toMatchObject({
      label: "Print covered · received",
      tone: "success",
    });
    expect(info.description).toContain("$21,052");
    expect(info.description).toContain("$6,652");
  });

  it("distinguishes unassigned project funding from no funding", () => {
    expect(
      projectFundingBadgeInfo(
        "not_assessed",
        summary({
          committed: 900,
          received: 900,
          printNeeded: 1_530,
          printSecured: 0,
        })
      )
    ).toMatchObject({
      label: "Print funding not assigned",
      compactLabel: "Print not assigned",
      tone: "warning",
    });
    expect(
      projectFundingBadgeInfo(
        "not_assessed",
        summary({
          committed: 0,
          received: 0,
          printNeeded: 1_530,
          printSecured: 0,
        })
      )
    ).toMatchObject({
      label: "Print funding needed",
      tone: "danger",
    });
  });

  it("prefers funding deliberately assigned to the print line", () => {
    expect(
      projectFundingBadgeInfo(
        "not_assessed",
        summary({ printNeeded: 1_530, printSecured: 765 })
      ).label
    ).toBe("Print 50% promised");
  });

  it("distinguishes unknown funding from a known empty funding record", () => {
    expect(projectFundingBadgeInfo("not_assessed", null).label).toBe(
      "Funding unknown"
    );
    expect(
      projectFundingBadgeInfo(
        "not_assessed",
        summary({ committed: 0, received: 0 })
      ).label
    ).toBe("No project funding recorded");
  });
});
