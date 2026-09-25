import { describe, expect, it } from "vitest";

import {
  printerPaymentTaskDescription,
  printerPaymentTaskTitle,
} from "./payment-task-copy";

describe("printer payment task copy", () => {
  const payment = {
    kind: "deposit",
    amount: "1764.00",
    currency: "USD",
    runTitle: "Fundamentals of the Faith",
    invoiceNumber: "INV-101",
  };

  it("makes the action and amount scannable", () => {
    expect(printerPaymentTaskTitle(payment)).toBe(
      "Coordinate deposit payment — $1,764.00"
    );
  });

  it("points the owner to the reviewed invoice and full payment lifecycle", () => {
    expect(printerPaymentTaskDescription(payment)).toContain("Invoice INV-101");
    expect(printerPaymentTaskDescription(payment)).toContain(
      "Ensure the wire request is sent and the printer payment is confirmed."
    );
  });
});
