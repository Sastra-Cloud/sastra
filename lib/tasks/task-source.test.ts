import { describe, expect, it } from "vitest";
import { isSourceControlledTask, taskSourceLink } from "./task-source";

const ordinary = {
  printPaymentId: null,
  royaltyPaymentId: null,
  licenseFeePaymentId: null,
  mouInvoicePaymentId: null,
  mouInvoiceSharedGroupId: null,
  approvalAssignmentId: null,
  printRunId: null,
};

describe("source controlled tasks", () => {
  it("links a printer payment back to the record that completes it", () => {
    const task = { ...ordinary, printPaymentId: "payment-id" };
    expect(isSourceControlledTask(task)).toBe(true);
    expect(taskSourceLink(task, "a-project")).toEqual({
      href: "/projects/a-project/print#payment-payment-id",
      label: "Open printer payment",
    });
  });

  it("leaves an ordinary task independently completable", () => {
    expect(isSourceControlledTask(ordinary)).toBe(false);
    expect(taskSourceLink(ordinary, "a-project")).toBeNull();
  });

  it("opens a shared invoice task at its agreement", () => {
    expect(taskSourceLink({ ...ordinary, mouInvoicePaymentId: "payment", mouInvoiceSharedGroupId: "agreement" }, "a-project")).toEqual({
      href: "/agreements/agreement",
      label: "Open invoice schedule",
    });
  });
});
