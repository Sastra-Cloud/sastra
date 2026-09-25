/**
 * Pre-screen policy for forwarded-email task extraction.
 *
 * Teammates forward plenty of mail for information only. A fast typed judgment
 * answers "is there a concrete request in here at all?" before we spend the
 * extraction call. Pure so the threshold stays table-testable.
 *
 * The question and state builders live here rather than inline at the call site
 * so `scripts/eval-jev-email-tasks.ts` can replay exactly what production asks.
 * A copy in the eval would drift from this one and quietly stop measuring the
 * shipped behavior.
 */

import { noul } from "@typesafe-ai/sdk";

/**
 * Below this probability of an actionable request, skip the extraction call.
 *
 * Measured against all 18 production suggestions (11 distinct emails) on
 * 2026-09-17 via `pnpm eval:jev`: every suggestion a person accepted scored
 * **0.53 or higher**, every suggestion a person rejected scored **0.52 or
 * lower**, and nothing a person wanted is skipped at any threshold up to 0.50.
 * 0.25 sits in the middle of that gap, so it has roughly equal headroom in both
 * directions. Re-run the eval before changing it — n is small (11 emails), and
 * the margin is the only thing keeping real work from being silently dropped.
 */
export const ACTIONABLE_SKIP_MAX = 0.25;

/** How much of the email body the judgment sees. Production and eval must match. */
export const PRESCREEN_BODY_CHARS = 4_000;

export type TaskPrescreenState = {
  forwardedEmail: {
    subject: string | null;
    originalSender: string | null;
    body: string;
  };
};

export function buildTaskPrescreenState(input: {
  subject: string | null | undefined;
  originalSender: string | null | undefined;
  bodyText: string | null | undefined;
}): TaskPrescreenState {
  return {
    forwardedEmail: {
      subject: input.subject ?? null,
      originalSender: input.originalSender ?? null,
      body: (input.bodyText ?? "").slice(0, PRESCREEN_BODY_CHARS),
    },
  };
}

export function taskPrescreenQuestions() {
  return {
    hasActionableRequest: noul(
      "Does `forwardedEmail` contain a concrete request that someone on the receiving team would need to do something about?",
      {
        true: "Someone asks for work, a decision, a reply, a payment, a document, or names a deadline to meet.",
        false:
          "The email only shares information. It is a newsletter, an automated notification, a receipt, an advertisement, or a message needing no action.",
      }
    ),
  };
}

export type TaskPrescreenJudgment = {
  hasActionableRequest: { noul: number };
};

export function shouldSkipTaskExtraction(
  judgment: TaskPrescreenJudgment | null | undefined
): boolean {
  const probability = judgment?.hasActionableRequest?.noul;
  if (typeof probability !== "number" || !Number.isFinite(probability)) {
    return false;
  }
  return probability < ACTIONABLE_SKIP_MAX;
}

/** One judged case with its known outcome, for choosing a threshold. */
export type SweepCase = {
  /** Probability the pre-screen returned. */
  noul: number;
  /** True when real work existed, so skipping this case would lose it. */
  isRealTask: boolean;
};

export type SweepPoint = {
  threshold: number;
  /** Real tasks that would be skipped — the error that loses work silently. */
  falseNegatives: number;
  skipped: number;
  skipRate: number;
};

/**
 * Score candidate thresholds against labeled cases.
 *
 * Uses the same strict `<` as `shouldSkipTaskExtraction`, so a probability
 * exactly equal to the threshold is kept, not skipped.
 */
export function sweepActionableSkipThreshold(
  cases: readonly SweepCase[],
  thresholds: readonly number[]
): SweepPoint[] {
  return thresholds.map((threshold) => {
    const skipped = cases.filter((item) => item.noul < threshold);
    return {
      threshold,
      falseNegatives: skipped.filter((item) => item.isRealTask).length,
      skipped: skipped.length,
      skipRate: cases.length ? skipped.length / cases.length : 0,
    };
  });
}
