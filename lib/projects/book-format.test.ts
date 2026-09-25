import { describe, expect, it } from "vitest";

import { bookFormatBadgeInfo, type BookFormatEvidence } from "./book-format";

const evidence = (
  values: Partial<BookFormatEvidence> = {}
): BookFormatEvidence => ({
  hasRightsRecord: true,
  formatPrint: false,
  formatEbook: false,
  hasPrintWorkflow: false,
  ...values,
});

describe("book format badges", () => {
  it("does not treat owned Print rights as a current print plan", () => {
    expect(
      bookFormatBadgeInfo(
        evidence({ formatPrint: true, formatEbook: true }),
        "not_assessed"
      )
    ).toMatchObject({ label: "eBook for now", tone: "info" });
  });

  it("shows combined formats when printing is operationally planned", () => {
    expect(
      bookFormatBadgeInfo(
        evidence({ formatPrint: true, formatEbook: true }),
        "seeking_funding"
      )
    ).toMatchObject({ label: "Print + eBook planned", tone: "info" });
  });

  it("uses print workflow evidence without claiming Print rights", () => {
    expect(
      bookFormatBadgeInfo(evidence({ hasPrintWorkflow: true }), "not_assessed")
    ).toEqual({
      label: "Print planned",
      description:
        "The current plan includes printing, but Print rights are not yet selected.",
      tone: "warning",
    });
  });

  it("shows a deliberate eBook-only current plan", () => {
    expect(
      bookFormatBadgeInfo(evidence({ formatEbook: true }), "not_required")
    ).toMatchObject({ label: "eBook only", tone: "info" });
  });

  it("flags owned Print rights whose operational plan is unset", () => {
    expect(
      bookFormatBadgeInfo(evidence({ formatPrint: true }), "not_assessed")
    ).toMatchObject({ label: "Print plan not set", tone: "warning" });
  });

  it("makes missing format evidence visible", () => {
    expect(
      bookFormatBadgeInfo(
        evidence({ hasRightsRecord: false }),
        "not_assessed"
      )
    ).toMatchObject({ label: "Format plan not set", tone: "warning" });
  });
});
