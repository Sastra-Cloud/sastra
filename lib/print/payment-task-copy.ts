export type PrinterPaymentTaskCopyInput = {
  kind: string;
  amount: string | number;
  currency: string;
  runTitle: string;
  invoiceNumber?: string | null;
};

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
  input: PrinterPaymentTaskCopyInput
): string {
  return `Coordinate ${paymentKindLabel(input.kind)} payment — ${moneyLabel(
    input.amount,
    input.currency
  )}`;
}

export function printerPaymentTaskDescription(
  input: PrinterPaymentTaskCopyInput
): string {
  const invoice = input.invoiceNumber
    ? `Invoice ${input.invoiceNumber} is ready`
    : "A confirmed printer invoice is ready";
  return `${invoice} on the Print tab for ${input.runTitle}. Ensure the wire request is sent and the printer payment is confirmed. This task follows the payment through requested and paid status.`;
}
