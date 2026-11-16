import { describe, expect, it } from "vitest";

import { isGeneratedPrinterPaymentTaskDescription, isGeneratedPrinterPaymentTaskTitle, printerPaymentTaskDescription } from "./payment-task-copy";

describe("printer payment task copy", () => {
  const payment = {
    kind: "deposit",
    amount: "1764.00",
    currency: "USD",
    runTitle: "Fundamentals of the Faith",
    invoiceNumber: "INV-101",
  };

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
