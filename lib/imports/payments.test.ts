import { describe, expect, it } from "vitest";

import {
  fundsSecured,
  resolvePaymentProjectIndex,
  sharedMouAllocationsReconcile,
  shouldCreateSharedMouGroup,
} from "./payments";
import { normalizeExtraction } from "./schema";

describe("agreement payment ownership", () => {
  const extraction = normalizeExtraction({
    agreementType: "mou_only",
    paymentProjectIndex: 1,
    mouPaymentSchedule: [
      {
        trigger: "on_completion",
        amount: 100,
        dueDate: "",
        notes: "shared",
      },
    ],
    projects: [{ title: "Book" }, { title: "Podcast" }],
  });

  it("uses the reviewed owner when several selected projects share a schedule", () => {
    expect(resolvePaymentProjectIndex(extraction, [0, 1])).toBe(1);
  });

  it("uses the only selected project without requiring another choice", () => {
    expect(resolvePaymentProjectIndex(extraction, [0])).toBe(0);
  });

  it("requires review when the configured owner is not selected", () => {
    expect(resolvePaymentProjectIndex(extraction, [0, 2])).toBeNull();
  });
});

describe("shared completion group detection", () => {
  const extraction = normalizeExtraction({
    agreementType: "mou_only",
    agreementTotalAmount: 20702,
    mouPaymentSchedule: [
      { trigger: "on_signing", amount: 10351 },
      { trigger: "on_completion", amount: 10351, dueDate: "2025-07-01" },
    ],
    projects: [
      { title: "One", totalAmount: 4000 },
      { title: "Two", totalAmount: 5000 },
      { title: "Three", totalAmount: 3000 },
      { title: "Four", totalAmount: 4000 },
      { title: "Five", totalAmount: 4702 },
    ],
  });

  it("creates one group for the five-project FY25 schedule", () => {
    expect(shouldCreateSharedMouGroup(extraction, [0, 1, 2, 3, 4])).toBe(true);
    expect(sharedMouAllocationsReconcile(extraction, [0, 1, 2, 3, 4])).toBe(
      true
    );
    expect(
      extraction.mouPaymentSchedule.reduce(
        (sum, payment) => sum + (payment.amount ?? 0),
        0
      )
    ).toBe(20702);
  });

  it("leaves a single-project schedule unchanged", () => {
    expect(shouldCreateSharedMouGroup(extraction, [0])).toBe(false);
  });

  it("blocks a mismatched reviewed allocation", () => {
    expect(sharedMouAllocationsReconcile(extraction, [0, 1])).toBe(false);
  });
});

describe("fundsSecured", () => {
  it("pre-fills Raised for a signed MoU/grant", () => {
    const signedMou = normalizeExtraction({
      agreementType: "mou_only",
      signedDate: "2023-06-19",
      projects: [{ title: "Grant work", totalAmount: 41910 }],
    });
    expect(fundsSecured(signedMou)).toBe(true);
  });

  it("does NOT pre-fill Raised for an unsigned grant application/proposal", () => {
    // A proposal states costs but the money is not awarded yet.
    const proposal = normalizeExtraction({
      agreementType: "mou_only",
      signedDate: "",
      projects: [{ title: "Grant work", totalAmount: 41910 }],
    });
    expect(fundsSecured(proposal)).toBe(false);
  });

  it("treats a signed mou_plus_license as funded", () => {
    const signed = normalizeExtraction({
      agreementType: "mou_plus_license",
      signedDate: "2023-06-19",
      projects: [{ title: "Book" }],
    });
    expect(fundsSecured(signed)).toBe(true);
  });

  it("never secures a license-only agreement (no incoming funding)", () => {
    const license = normalizeExtraction({
      agreementType: "license_only",
      signedDate: "2023-06-19",
      projects: [{ title: "Book" }],
    });
    expect(fundsSecured(license)).toBe(false);
  });
});
