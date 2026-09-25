/**
 * Pure blocker-decision logic (no DB) — given a project's current rights,
 * budget lines, and tasks, produce the set of blockers. Kept framework-free so
 * the rules are unit-testable; the engine wraps this with I/O + persistence.
 */

import { committedFundingTotal } from "@/lib/budget/compute";

export type Sev = "warning" | "critical";

export type BType =
  | "rights"
  | "budget"
  | "overdue_task"
  | "stalled_task"
  | "schedule";

/** Velocity forecast fed to the blocker rules (from lib/forecast). */
export type ForecastInput = {
  risk: "on_track" | "at_risk" | "likely_late" | "unknown";
  projectedDate: string | null;
  dueDate: string | null;
};

export type Computed = {
  type: BType;
  severity: Sev;
  title: string;
  sourceType?: string | null;
  sourceId?: string | null;
};

export type RightsInput =
  | {
      id: string;
      overallStatus: string;
      completeByDate: string | null;
      mouExpiresDate?: string | null;
      licenseExpiresDate?: string | null;
      // Auto-renewing licenses don't lapse, so they raise no expiry blocker.
      licenseAutoRenews?: boolean;
    }
  | undefined;

const RENEWAL_WINDOW_DAYS = 30;

function addDaysYmd(nowMs: number, days: number): string {
  return new Date(nowMs + days * 86_400_000).toISOString().slice(0, 10);
}

export type BudgetInput = {
  amount: string | number;
  /** "Raised" — funding secured/pledged (committed), not cash received. */
  amountSecured: string | number;
  currency: string;
  category?: string | null;
};

export type TaskInput = {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  updatedAt: Date | string;
};

export type DependencyInput = {
  taskId: string; // the blocked (dependent) task
  taskTitle: string;
  taskStatus: string;
  blockedByTitle: string;
  blockedByStatus: string;
  blockedByDueDate: string | null;
};

const STALE_MS = 5 * 86_400_000;

export function computeBlockers(args: {
  rights: RightsInput;
  budgets: BudgetInput[];
  /** Internal delivery cost across the applicable budget scopes. */
  operationalNeeded?: number;
  /**
   * Expected/actual net funding available after each scope's deduction.
   * When provided, this—not gross partner commitments—drives print readiness.
   */
  operationalAvailable?: number;
  /** Scheduled-but-unreceived MoU receivables — counts as committed. */
  scheduledFunding?: number;
  /** Manual non-MoU funding already received — counts against the shortfall. */
  receivedFunding?: number;
  tasks: TaskInput[];
  /**
   * Accepted for compatibility, but ordinary dependency sequencing is neutral
   * pipeline waiting. The overdue/stalled predecessor is the root blocker.
   */
  dependencies?: DependencyInput[];
  /** Velocity-vs-deadline forecast; produces a warning-only pace blocker. */
  forecast?: ForecastInput;
  /** The project's own committed deadline + status, for the project-overdue rule. */
  project?: { dueDate: string | null; status: string };
  today: string; // yyyy-mm-dd
  nowMs: number;
}): Computed[] {
  const {
    rights,
    budgets,
    operationalNeeded,
    operationalAvailable,
    scheduledFunding = 0,
    receivedFunding = 0,
    tasks,
    forecast,
    project,
    today,
    nowMs,
  } = args;
  const computed: Computed[] = [];

  // Rights — the single agreement; blocks while not complete (overdue = critical).
  if (rights && rights.overallStatus !== "complete") {
    const overdue = rights.completeByDate && rights.completeByDate < today;
    if (overdue) {
      computed.push({
        type: "rights",
        severity: "critical",
        title: `Rights overdue (due ${rights.completeByDate})`,
        sourceType: "rights_item",
        sourceId: rights.id,
      });
    } else if (rights.overallStatus === "in_progress") {
      computed.push({
        type: "rights",
        severity: "warning",
        title: "Rights in progress",
        sourceType: "rights_item",
        sourceId: rights.id,
      });
    }
    // overallStatus 'none' (not set up) → no blocker
  }

  // Rights expiry / renewal — a held agreement can lapse even when "complete".
  if (rights) {
    const soon = addDaysYmd(nowMs, RENEWAL_WINDOW_DAYS);
    const expiry = (label: string, dateStr: string | null | undefined) => {
      if (!dateStr) return;
      if (dateStr < today) {
        computed.push({
          type: "rights",
          severity: "critical",
          title: `${label} expired (${dateStr})`,
          sourceType: "rights_item",
          sourceId: rights.id,
        });
      } else if (dateStr <= soon) {
        computed.push({
          type: "rights",
          severity: "warning",
          title: `${label} expires ${dateStr}`,
          sourceType: "rights_item",
          sourceId: rights.id,
        });
      }
    };
    expiry("MoU", rights.mouExpiresDate);
    // An auto-renewing license won't lapse → no expiry blocker (UI shows the date).
    if (!rights.licenseAutoRenews) expiry("License", rights.licenseExpiresDate);
  }

  // Budget shortfall — committed funding offsets the quote. "Raised"
  // (amountSecured) is funding secured/pledged (an MoU/grant pre-fills it on
  // import; self-/non-MoU funding is entered there too); scheduled-but-unreceived
  // MoU receivables count as committed as well. Manual non-MoU donations logged
  // as received also offset the shortfall; MoU-linked receipts are excluded by
  // the caller to avoid double-counting. Only an *uncommitted* shortfall blocks,
  // and it hard-blocks printing specifically (the rest of the pipeline can still
  // proceed).
  let needed = 0;
  let raised = 0;
  for (const b of budgets) {
    needed += Number(b.amount);
    raised += Number(b.amountSecured);
  }
  needed = operationalNeeded ?? needed;
  const committed =
    operationalAvailable ??
    committedFundingTotal(raised, scheduledFunding, receivedFunding);
  if (needed > committed) {
    const short = needed - committed;
    const currency = budgets[0]?.currency ?? "USD";
    const printingInScope = budgets.some((b) => b.category === "print_ship");
    computed.push(
      printingInScope
        ? {
            type: "budget",
            severity: "critical",
            title:
              operationalAvailable == null
                ? `Printing blocked — funding not committed (${short.toLocaleString()} ${currency})`
                : `Printing blocked — expected available funding is ${short.toLocaleString()} ${currency} short after deductions`,
            sourceType: "budget",
            sourceId: null,
          }
        : {
            type: "budget",
            severity: "warning",
            title: `Budget shortfall: ${short.toLocaleString()} ${currency}`,
            sourceType: "budget",
            sourceId: null,
          }
    );
  }

  // Overdue tasks (string compare is safe for ISO yyyy-mm-dd).
  for (const t of tasks) {
    if (t.status !== "done" && t.dueDate && t.dueDate < today) {
      computed.push({
        type: "overdue_task",
        severity: "warning",
        title: `Overdue: ${t.title}`,
        sourceType: "task",
        sourceId: t.id,
      });
    }
  }

  // Stalled: in-progress tasks untouched for 5+ days (feeds standup insights
  // too). An overdue task is already the stronger root issue, so don't report
  // the same task twice.
  for (const t of tasks) {
    if (
      t.status === "in_progress" &&
      !(t.dueDate && t.dueDate < today) &&
      nowMs - new Date(t.updatedAt).getTime() > STALE_MS
    ) {
      computed.push({
        type: "stalled_task",
        severity: "warning",
        title: `Stalled: ${t.title}`,
        sourceType: "task",
        sourceId: t.id,
      });
    }
  }

  // Project overdue: the project itself is past its own committed deadline. This
  // is a concrete overrun (not a forecast), so — like an overdue rights agreement
  // — it flips health red. Proposal and closed projects are excluded because a
  // proposal date is not yet a committed delivery deadline.
  const projectOverdue =
    project?.dueDate != null &&
    project.dueDate < today &&
    project.status !== "proposal" &&
    project.status !== "completed" &&
    project.status !== "cancelled";
  if (projectOverdue) {
    computed.push({
      type: "schedule",
      severity: "critical",
      title: `Project overdue (due ${project!.dueDate})`,
      sourceType: "project",
      sourceId: null,
    });
  }

  // Pace: projected finish is after the due date. Warning-only — a forecast never
  // flips health red on its own (that's reserved for concrete critical blockers).
  // Suppressed once the project is already overdue, where the concrete overrun
  // above is the stronger, non-speculative statement.
  if (
    !projectOverdue &&
    project?.status !== "proposal" &&
    forecast?.risk === "likely_late" &&
    forecast.dueDate &&
    forecast.projectedDate
  ) {
    computed.push({
      type: "schedule",
      severity: "warning",
      title: `Pace: projected finish ${forecast.projectedDate} is after due date ${forecast.dueDate}`,
      sourceType: "forecast",
      sourceId: null,
    });
  }

  return computed;
}

/** red = any critical · amber = any warning · green = none. */
export function healthFromBlockers(
  computed: Computed[]
): "red" | "amber" | "green" {
  return computed.some((c) => c.severity === "critical")
    ? "red"
    : computed.length > 0
      ? "amber"
      : "green";
}
