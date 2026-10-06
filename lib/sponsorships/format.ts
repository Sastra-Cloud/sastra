export function sponsorshipMoney(value: string | number, currency: string) {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "code", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value)); }
  catch { return `${currency} ${Number(value).toFixed(2)}`; }
}

export function sponsorshipStatus(status: string, invoiceStatus: string | null, received: string) {
  if (status === "cancelled") return "Cancelled";
  if (status === "draft") return "Draft";
  if (invoiceStatus === "received") return "Paid";
  if (invoiceStatus === "sending") return "Check delivery";
  if (Number(received) > 0) return "Partly paid";
  return invoiceStatus === "sent" ? "Sent" : "Invoice ready";
}
