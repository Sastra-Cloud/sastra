export type PrinterPaymentTaskCopyInput = {
  kind: string;
  amount: string | number;
  currency: string;
  runTitle: string;
  invoiceNumber?: string | null;
};

export type PrinterPaymentTaskStatus = "planned" | "requested" | "paid";

function paymentKindLabel(kind: string) {
  if (kind === "deposit") return "deposit";
  if (kind === "final") return "final";
  if (kind === "full") return "full";
  return "printer";
}

function moneyLabel(value: string | number, currency: string) {
  const amount = Number(value) || 0;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function printerPaymentTaskTitle(
  input: PrinterPaymentTaskCopyInput,
  status: PrinterPaymentTaskStatus = "planned"
): string {
  const action = status === "paid"
    ? `${paymentKindLabel(input.kind)} payment confirmed`
    : status === "requested"
      ? `Confirm printer received ${paymentKindLabel(input.kind)} payment`
      : `Send ${paymentKindLabel(input.kind)} payment request`;
  return `${action.charAt(0).toUpperCase()}${action.slice(1)} — ${moneyLabel(
    input.amount,
    input.currency
  )}`;
}

export function isGeneratedPrinterPaymentTaskTitle(
  input: PrinterPaymentTaskCopyInput,
  title: string
): boolean {
  const legacy = `Coordinate ${paymentKindLabel(input.kind)} payment — ${moneyLabel(input.amount, input.currency)}`;
  return title === legacy || (["planned", "requested", "paid"] as const).some(
    (status) => title === printerPaymentTaskTitle(input, status)
  );
}

export function printerPaymentTaskDescription(
  input: PrinterPaymentTaskCopyInput,
  status: PrinterPaymentTaskStatus = "planned"
): string {
  const invoice = input.invoiceNumber
    ? `Invoice ${input.invoiceNumber} is ready`
    : "A confirmed printer invoice is ready";
  const context = `${invoice} on the Print tab for ${input.runTitle}.`;
  if (status === "requested") {
    return `${context} The wire request has been sent. Confirm that the printer was paid, then mark the payment paid on the Print tab. This task will close automatically.`;
  }
  if (status === "paid") {
    return `${context} The printer payment was marked paid on the Print tab. This task closed automatically.`;
  }
  return `${context} Send the wire request from the Print tab. After the printer payment is confirmed, mark it paid there. This task will close automatically.`;
}

/** Recognize only app-written copy so payment updates preserve a person's edits. */
export function isGeneratedPrinterPaymentTaskDescription(
  input: PrinterPaymentTaskCopyInput,
  description: string | null
): boolean {
  if (!description) return false;
  const invoice = input.invoiceNumber
    ? `Invoice ${input.invoiceNumber} is ready`
    : "A confirmed printer invoice is ready";
  const legacy = `${invoice} on the Print tab for ${input.runTitle}. Ensure the wire request is sent and the printer payment is confirmed. This task follows the payment through requested and paid status.`;
  return description === legacy ||
    (["planned", "requested", "paid"] as const).some(
      (status) => description === printerPaymentTaskDescription(input, status)
    );
}
