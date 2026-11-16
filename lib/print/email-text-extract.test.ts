import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ ai: vi.fn() }));
vi.mock("@/lib/ai/openrouter", () => ({ aiStructured: m.ai }));
vi.mock("@/lib/document-learning/service", () => ({ localDocumentGuidance: async () => "" }));
vi.mock("./extract", () => ({ upsertEmailSuggestedQuote: vi.fn() }));
import { extractTextQuoteSuggestions } from "./email-text-extract";

beforeEach(() => vi.clearAllMocks());
const scope = { projectId: "project", runId: "request", actorUserId: "manager" };

it("reads an explicitly pasted price format that the automatic pattern gate does not understand, without inventing a total", async () => {
  m.ai.mockResolvedValue({ quotes: [{ kind: "quote", quantityCps: 1200, unitPrice: 2, totalAmount: null, currency: "EUR" }] });
  const result = await extractTextQuoteSuggestions({ ...scope, bodyText: "Print quantity: 1200. Price per book: EUR 2.00." });
  expect(m.ai).toHaveBeenCalledTimes(1);
  expect(result.usedAi).toBe(true);
  expect(result.quotes[0].quote).toMatchObject({ quantityCps: 1200, unitPrice: "2.000", totalAmount: null, currency: "EUR" });
});

it("retains the reused prices and marks the fallback for review when AI is unavailable", async () => {
  m.ai.mockRejectedValue(new Error("Provider unavailable"));
  const result = await extractTextQuoteSuggestions({ ...scope, bodyText: `This book has the same specs as Reference Book, so reuse the quote:
1000 cps @ USD 1.36 per cpy
2000 cps @ USD 0.86 per cpy
3000 cps @ USD 0.72 per cpy` });
  expect(result.usedAi).toBe(false);
  expect(result.quotes.map(item => item.quote.unitPrice)).toEqual(["1.360", "0.860", "0.720"]);
  expect(result.quotes.every(item => item.flags.some(flag => flag.kind === "ai_failed") && item.flags.some(flag => flag.kind === "reused_quote"))).toBe(true);
});
