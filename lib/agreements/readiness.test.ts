import { describe, expect, it } from "vitest";

import {
  allocateSharedReceipt,
  evaluateSharedMouReadiness,
} from "./readiness";

describe("shared MoU readiness", () => {
  it("waits for every active member", () => {
    const result = evaluateSharedMouReadiness({
      members: [
        { title: "One", status: "completed" },
        { title: "Two", status: "active" },
      ],
      earliestInvoiceDate: "2025-07-01",
      today: "2025-07-02",
      invoiced: false,
      received: false,
    });
    expect(result.status).toBe("locked");
    expect(result.reason).toContain("1 of 2");
    expect(result.reason).toContain("Two");
  });

  it("honors the earliest invoice date after completion", () => {
    const base = {
      members: [{ title: "One", status: "completed" }],
      earliestInvoiceDate: "2025-07-01",
      invoiced: false,
      received: false,
    };
    expect(
      evaluateSharedMouReadiness({ ...base, today: "2025-06-30" }).status
    ).toBe("locked");
    expect(
      evaluateSharedMouReadiness({ ...base, today: "2025-07-01" }).status
    ).toBe("ready");
  });

  it("does not completion-gate a signing payment in the same group", () => {
    const result = evaluateSharedMouReadiness({
      members: [{ title: "One", status: "active" }],
      earliestInvoiceDate: "2025-01-15",
      today: "2025-01-15",
      invoiced: false,
      received: false,
      requiresCollectiveCompletion: false,
    });
    expect(result.status).toBe("ready");
  });
});

describe("shared MoU receipt allocation", () => {
  it("distributes rounding residue deterministically", () => {
    const result = allocateSharedReceipt("10.00", [
      { projectId: "b", membershipId: "mb", amount: "1.00" },
      { projectId: "a", membershipId: "ma", amount: "1.00" },
      { projectId: "c", membershipId: "mc", amount: "1.00" },
    ]);
    expect(result).toEqual([
      { projectId: "a", membershipId: "ma", amount: "3.34" },
      { projectId: "b", membershipId: "mb", amount: "3.33" },
      { projectId: "c", membershipId: "mc", amount: "3.33" },
    ]);
    expect(result.reduce((sum, row) => sum + Number(row.amount), 0)).toBe(10);
  });
});

describe("delivery and invoice lifecycle", () => {
  const base = { members: [{ title: "Articles/audio", status: "completed" }, { title: "Videos", status: "completed" }],
    earliestInvoiceDate: null, today: "2026-08-08", invoiced: false, received: false,
    deliveryRequirements: ["DOCX", "MP3", "MP4"],
  };
  const evidence = ["DOCX", "MP3", "MP4"].map((requirement) => ({ requirement, url: `https://example.org/${requirement}` }));
  it("requires every evidence item plus manager confirmation", () => {
    expect(evaluateSharedMouReadiness(base).reason).toContain("DOCX, MP3, MP4");
    expect(evaluateSharedMouReadiness({ ...base, deliveryEvidence: evidence }).status).toBe("locked");
    expect(evaluateSharedMouReadiness({ ...base, deliveryEvidence: evidence.slice(1), deliveryConfirmed: true }).status).toBe("locked");
    expect(evaluateSharedMouReadiness({ ...base, deliveryEvidence: evidence, deliveryConfirmed: true }).status).toBe("ready");
  });
  it("rechecks gates after PDF generation and keeps sending separate", () => {
    const ready = { ...base, deliveryEvidence: evidence, deliveryConfirmed: true, invoiced: true };
    expect(evaluateSharedMouReadiness(ready).status).toBe("invoiced");
    expect(evaluateSharedMouReadiness({ ...ready, deliveryConfirmed: false }).status).toBe("locked");
    expect(evaluateSharedMouReadiness({ ...ready, reconciliationError: "Allocation mismatch" }).status).toBe("locked");
    expect(evaluateSharedMouReadiness({ ...ready, members: [{ title: "Videos", status: "active" }] }).status).toBe("locked");
    expect(evaluateSharedMouReadiness({ ...ready, sent: true }).status).toBe("sent");
    expect(evaluateSharedMouReadiness({ ...ready, received: true }).status).toBe("received");
  });
});
