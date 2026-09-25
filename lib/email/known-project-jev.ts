/**
 * Pre-screen policy for the known-project tie-breaker.
 *
 * The tie-breaker only accepts a project when the model quotes evidence that
 * occurs verbatim in the message, so a typed judgment can never stand in for it
 * — it produces no quotable text. What it can do is recognise the common case:
 * the message names no project at all. Then there is nothing to tie-break and
 * the call is pure cost.
 *
 * Pure so the threshold stays table-testable.
 */

/** Label used for "this message distinguishes no candidate". */
export const NO_PROJECT_EVIDENCE = "none_of_the_above";

/** How sure we must be that no candidate is indicated before skipping. */
export const NO_EVIDENCE_MIN_CONFIDENCE = 0.8;

export type KnownProjectJudgment = {
  indicatedProject: { choice: string; confidence: number };
};

/** Skip the tie-breaker only on a confident "no project is indicated". */
export function shouldSkipKnownProjectMatch(
  judgment: KnownProjectJudgment | null | undefined
): boolean {
  const answer = judgment?.indicatedProject;
  if (!answer || typeof answer.confidence !== "number") return false;
  if (!Number.isFinite(answer.confidence)) return false;
  return (
    answer.choice === NO_PROJECT_EVIDENCE &&
    answer.confidence >= NO_EVIDENCE_MIN_CONFIDENCE
  );
}

/** Stable option label for a candidate, so ids stay out of the prompt. */
export function candidateOptionLabel(index: number): string {
  return `project_${index}`;
}
