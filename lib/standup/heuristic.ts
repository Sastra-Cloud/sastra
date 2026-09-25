/**
 * Pure standup stuck-risk heuristic (no DB, no AI) — the deterministic baseline
 * that the optional AI enrichment refines. Kept framework-free so it's unit-testable.
 */

export type StuckRisk = "low" | "medium" | "high";

export type HeuristicResult = {
  impediments: string[];
  stuckRisk: StuckRisk;
  reasoning: string;
};

const NEGATIVE = new Set([
  "no",
  "none",
  "nope",
  "n/a",
  "na",
  "hope not",
  "nothing",
  "no impediments",
  "all good",
]);

/** Judge a participant's standup from their answers + task telemetry. */
export function heuristic(
  status: string,
  answers: { prompt: string; content: string }[],
  tele: { open: number; overdue: number; stalled: number }
): HeuristicResult {
  const impediments: string[] = [];
  for (const a of answers) {
    const isImpedimentQ = /impedim|difficult|blocker|stuck|in your way/i.test(
      a.prompt
    );
    const val = a.content.trim();
    if (isImpedimentQ && val && !NEGATIVE.has(val.toLowerCase())) {
      impediments.push(val);
    }
  }
  const flags = (impediments.length ? 1 : 0) + tele.overdue + tele.stalled;
  let stuckRisk: StuckRisk = "low";
  if (status === "missed" || flags >= 2) stuckRisk = "high";
  else if (flags === 1) stuckRisk = "medium";
  const reasoning =
    status === "missed"
      ? "Did not submit a standup."
      : `${tele.overdue} overdue, ${tele.stalled} stalled of ${tele.open} open tasks.`;
  return { impediments, stuckRisk, reasoning };
}
