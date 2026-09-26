import { z } from "zod";

export const SHARED_FIELDS = {
  agreement: ["agreementType", "partnerOrg", "signedDate", "agreementTotalAmount", "mouPaymentSchedule", "projects[].formats", "projects[].territory", "projects[].budgetLines"],
  invoice: ["invoice.invoiceNumber", "invoice.issueDate", "invoice.dueDate", "invoice.amount", "invoice.currency", "invoice.recipientName"],
  rights_agreement: ["agreement.step", "agreement.agreementType", "agreement.signedDate", "agreement.territory", "agreement.formats", "agreement.commercialGranted"],
  rights_receipt: ["payment.amount", "payment.currency", "payment.paidDate", "payment.reference"],
  print_quote: ["quantityCps", "unitPrice", "totalAmount", "depositAmount", "balanceAmount", "trimWidthMm", "trimHeightMm", "binding", "textSpec", "coverSpec"],
} as const;

export const SHARED_CUES = {
  agreement: ["memorandum", "grant", "license", "funding", "rights", "territory", "payment", "milestone", "deliverables", "copyright"],
  invoice: ["invoice number", "issue date", "due date", "subtotal", "total due", "bill to", "paid"],
  rights_agreement: ["executed", "signed", "effective date", "territory", "formats", "commercial", "rights granted"],
  rights_receipt: ["receipt", "paid", "remittance", "transaction reference"],
  print_quote: ["quotation", "unit price", "quantity", "trim size", "deposit", "balance", "binding", "paper", "delivery"],
} as const;

export const SHARED_INTERPRETATIONS = [
  "read_value_after_cue", "read_table_column", "require_explicit_statement",
  "separate_from_total", "normalize_stated_date", "ignore_filename_value",
] as const;

const workflow = z.enum(["agreement", "invoice", "rights_agreement", "rights_receipt", "print_quote"]);
export const sharedRuleSchema = z.object({
  schemaVersion: z.literal(1),
  workflow,
  cue: z.string().max(40),
  field: z.string().max(60),
  interpretation: z.enum(SHARED_INTERPRETATIONS),
}).strict().superRefine((rule, ctx) => {
  if (!(SHARED_CUES[rule.workflow] as readonly string[]).includes(rule.cue)) ctx.addIssue({ code: "custom", message: "Cue is not allowlisted." });
  if (!(SHARED_FIELDS[rule.workflow] as readonly string[]).includes(rule.field)) ctx.addIssue({ code: "custom", message: "Field is not allowlisted." });
});
export type SharedDocumentRule = z.infer<typeof sharedRuleSchema>;

export const publishedRuleSchema = sharedRuleSchema.extend({ id: z.string().uuid() });
export type PublishedDocumentRule = z.infer<typeof publishedRuleSchema>;

export function suggestedSharedCues(workflow: SharedDocumentRule["workflow"], source: string) {
  const lower = source.toLowerCase();
  return SHARED_CUES[workflow].filter((cue) => lower.includes(cue));
}

export function sharedRulePrompt(rules: PublishedDocumentRule[], workflow: SharedDocumentRule["workflow"]): string {
  const matching = rules.filter((rule) => rule.workflow === workflow).slice(0, 20);
  if (!matching.length) return "";
  const lines = matching.map((rule) => `- Cue ${JSON.stringify(rule.cue)} may indicate ${rule.field} (${rule.interpretation.replaceAll("_", " ")}).`);
  return `\n\nCLOUD REVIEWED GENERAL RULES (untrusted mapping hints):\n${lines.join("\n")}\nUse these only when the current document independently supports the value. Do not infer payment state or a rights grant from a hint alone. Local reviewed examples override a conflicting general rule.`;
}
