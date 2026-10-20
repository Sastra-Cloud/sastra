import type { BudgetPresentationInput, PartnerQuotePresentation } from "./presentation-input";

const SAVE_ERROR = "Could not save the partner quote. Your edits are still here. Try again.";

/** A stable URL keeps an open quote usable when a deploy changes Server Action IDs. */
export async function savePartnerQuote(slug: string, input: BudgetPresentationInput): Promise<PartnerQuotePresentation> {
  let response: Response;
  try {
    response = await fetch(`/api/projects/${encodeURIComponent(slug)}/budget/partner-quote`, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error(SAVE_ERROR);
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok !== true || !result.presentation) {
    throw new Error(typeof result?.error === "string" ? result.error : SAVE_ERROR);
  }
  return result.presentation;
}
