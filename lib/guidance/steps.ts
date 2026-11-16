/**
 * Live step lists ("Budget steps", "Printing steps"). A list is computed from
 * saved records, so it is right for imported, forwarded, and older projects
 * too. Pure and client-safe.
 */

export type GuideStepStatus = "done" | "next" | "later";

export type GuideStepAction = {
  label: string;
  /** In-page anchor or route. Omit when the page handles `id` itself. */
  href?: string;
  /** Action name handled by the page (for example opening guided setup). */
  id?: string;
};

export type GuideStepDraft = {
  key: string;
  label: string;
  done: boolean;
  /** One short sentence about this step's current state. */
  fact: string;
  action?: GuideStepAction;
  /** Optional steps never become the next step and do not count as missing. */
  optional?: boolean;
};

export type GuideStep = Omit<GuideStepDraft, "done"> & {
  status: GuideStepStatus;
};

export type GuideSteps = {
  steps: GuideStep[];
  doneCount: number;
  /** Steps that count toward progress (optional steps count once done). */
  total: number;
  allDone: boolean;
  next: GuideStep | null;
};

/** Mark the first unfinished required step as next; the rest wait. */
export function finalizeSteps(drafts: readonly GuideStepDraft[]): GuideSteps {
  let nextKey: string | null = null;
  const steps = drafts.map(({ done, ...step }): GuideStep => {
    if (done) return { ...step, status: "done" };
    if (!step.optional && nextKey === null) {
      nextKey = step.key;
      return { ...step, status: "next" };
    }
    return { ...step, status: "later" };
  });
  const counted = steps.filter(
    (step) => !step.optional || step.status === "done"
  );
  const doneCount = counted.filter((step) => step.status === "done").length;
  return {
    steps,
    doneCount,
    total: counted.length,
    allDone: doneCount === counted.length,
    next: steps.find((step) => step.status === "next") ?? null,
  };
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
}
