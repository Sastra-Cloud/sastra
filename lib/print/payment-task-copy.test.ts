import { describe, expect, it } from "vitest";

import {
  isGeneratedPrinterPaymentTaskDescription,
  isGeneratedPrinterPaymentTaskTitle,
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
      "Send deposit payment request — $1,764.00"
    );
    expect(printerPaymentTaskTitle(payment, "requested")).toBe(
      "Confirm printer received deposit payment — $1,764.00"
    );
    expect(printerPaymentTaskTitle(payment, "paid")).toBe(
      "Deposit payment confirmed — $1,764.00"
    );
  });

  it("gives the owner the next payment action at each stage", () => {
    expect(printerPaymentTaskDescription(payment)).toContain("Invoice INV-101");
    expect(printerPaymentTaskDescription(payment)).toContain(
      "Send the wire request from the Print tab."
    );
    expect(printerPaymentTaskDescription(payment, "requested")).toContain(
      "The wire request has been sent. Confirm that the printer was paid"
    );
    expect(printerPaymentTaskDescription(payment, "requested")).not.toContain(
      "Send the wire request from the Print tab."
    );
    expect(printerPaymentTaskDescription(payment, "paid")).toContain(
      "This task closed automatically."
    );
  });

  it("recognizes generated copy but preserves a person's task notes", () => {
    expect(isGeneratedPrinterPaymentTaskTitle(payment, "Coordinate deposit payment — $1,764.00")).toBe(true);
    expect(isGeneratedPrinterPaymentTaskTitle(payment, "Call the printer — $1,764.00")).toBe(false);
    const legacy = "Invoice INV-101 is ready on the Print tab for Fundamentals of the Faith. Ensure the wire request is sent and the printer payment is confirmed. This task follows the payment through requested and paid status.";
    expect(isGeneratedPrinterPaymentTaskDescription(payment, legacy)).toBe(true);
    expect(isGeneratedPrinterPaymentTaskDescription(
      payment,
      printerPaymentTaskDescription(payment, "requested")
    )).toBe(true);
    expect(isGeneratedPrinterPaymentTaskDescription(
      payment,
      `${legacy} Call the printer on Friday.`
    )).toBe(false);
  });
});
