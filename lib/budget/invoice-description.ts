export function describeInvoiceWork(input: { trigger: string; agreement: string; works: string[]; fallback?: string | null }): string {
  const milestone = input.trigger === "on_signing" ? "Signing installment" : input.trigger === "on_completion" ? "Completion and delivery installment" : input.fallback?.trim() || "Funding installment";
  const works = [...new Set(input.works.map((work) => work.trim()).filter(Boolean))];
  return `${milestone} under ${input.agreement}.${works.length ? `\n\nCovered work:\n${works.map((work) => `- ${work}`).join("\n")}` : ""}`;
}
