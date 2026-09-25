import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";

import { runAfterResponse } from "@/lib/after-response";
import { db } from "@/lib/db";
import {
  blockers,
  budgetItems,
  budgetScopePresentations,
  fundingReceipts,
  mouPayments,
  projectMembers,
  projects,
  rightsItems,
  tasks,
  user,
} from "@/lib/db/schema";
import {
  expectedNetCents,
  normalizeDeductionBps,
} from "@/lib/budget/compute";
import { notifyMany } from "@/lib/notifications";
import { computeBlockers, healthFromBlockers } from "@/lib/blockers/compute";
import { getProjectForecast } from "@/lib/forecast/queries";

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function scopeKey(printRunId: string | null) {
  return printRunId ?? "main";
}

function cents(value: string | number | null | undefined) {
  return Math.round(Number(value ?? 0) * 100);
}

/**
 * Recompute a project's blockers from rights (un-granted), budget (shortfall),
 * and overdue tasks; replace the cached set and write projects.health_status
 * (red = any critical, amber = any warning, green = none).
 */
export async function recomputeProjectBlockers(projectId: string) {
  const today = todayYmd();

  const [proj] = await db
    .select({
      title: projects.title,
      slug: projects.slug,
      status: projects.status,
      dueDate: projects.dueDate,
      prevHealth: projects.healthStatus,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  const [
    rights,
    budgets,
    projectTasks,
    scheduled,
    manualReceipts,
    presentations,
  ] = await Promise.all([
    db.select().from(rightsItems).where(eq(rightsItems.projectId, projectId)),
    db.select().from(budgetItems).where(eq(budgetItems.projectId, projectId)),
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        dueDate: tasks.dueDate,
        status: tasks.status,
        updatedAt: tasks.updatedAt,
      })
      .from(tasks)
      .where(eq(tasks.projectId, projectId)),
    db
      .select({
        amount: mouPayments.amount,
        printRunId: mouPayments.printRunId,
        paidAt: mouPayments.paidAt,
        expectedNetAmount: fundingReceipts.expectedNetAmount,
        actualNetAmount: fundingReceipts.actualNetAmount,
      })
      .from(mouPayments)
      .leftJoin(fundingReceipts, eq(fundingReceipts.id, mouPayments.receiptId))
      .where(eq(mouPayments.projectId, projectId)),
    db
      .select({
        amount: fundingReceipts.amount,
        printRunId: fundingReceipts.printRunId,
        expectedNetAmount: fundingReceipts.expectedNetAmount,
        actualNetAmount: fundingReceipts.actualNetAmount,
      })
      .from(fundingReceipts)
      .leftJoin(mouPayments, eq(mouPayments.receiptId, fundingReceipts.id))
      .where(
        and(eq(fundingReceipts.projectId, projectId), isNull(mouPayments.id))
      ),
    db
      .select()
      .from(budgetScopePresentations)
      .where(eq(budgetScopePresentations.projectId, projectId)),
  ]);

  const deductionByScope = new Map(
    presentations.map((row) => [
      scopeKey(row.printRunId),
      normalizeDeductionBps(row.deductionBps),
    ])
  );
  const bpsFor = (printRunId: string | null) =>
    deductionByScope.get(scopeKey(printRunId)) ?? 0;

  const scopeTotals = new Map<
    string,
    {
      neededCents: number;
      raisedCents: number;
      paymentGrossCents: number;
      paymentNetCents: number;
      standaloneGrossCents: number;
      standaloneNetCents: number;
      bps: number;
    }
  >();
  const ensureScope = (printRunId: string | null) => {
    const key = scopeKey(printRunId);
    const existing = scopeTotals.get(key);
    if (existing) return existing;
    const created = {
      neededCents: 0,
      raisedCents: 0,
      paymentGrossCents: 0,
      paymentNetCents: 0,
      standaloneGrossCents: 0,
      standaloneNetCents: 0,
      bps: bpsFor(printRunId),
    };
    scopeTotals.set(key, created);
    return created;
  };
  for (const row of budgets) {
    const scope = ensureScope(row.printRunId);
    scope.neededCents += cents(row.amount);
    scope.raisedCents += cents(row.amountSecured);
  }
  for (const row of scheduled) {
    const scope = ensureScope(row.printRunId);
    const gross = cents(row.amount);
    scope.paymentGrossCents += gross;
    scope.paymentNetCents +=
      row.paidAt != null
        ? row.actualNetAmount != null
          ? cents(row.actualNetAmount)
          : row.expectedNetAmount != null
            ? cents(row.expectedNetAmount)
            : expectedNetCents(gross, scope.bps)
        : expectedNetCents(gross, scope.bps);
  }
  for (const row of manualReceipts) {
    const scope = ensureScope(row.printRunId);
    const gross = cents(row.amount);
    scope.standaloneGrossCents += gross;
    scope.standaloneNetCents +=
      row.actualNetAmount != null
        ? cents(row.actualNetAmount)
        : row.expectedNetAmount != null
          ? cents(row.expectedNetAmount)
          : expectedNetCents(gross, scope.bps);
  }

  let scheduledFunding = 0;
  let receivedFunding = 0;
  let operationalNeeded = 0;
  let operationalAvailable = 0;
  for (const scope of scopeTotals.values()) {
    scheduledFunding += scope.paymentGrossCents / 100;
    receivedFunding += scope.standaloneGrossCents / 100;
    operationalNeeded += scope.neededCents / 100;
    operationalAvailable +=
      (Math.max(
        expectedNetCents(scope.raisedCents, scope.bps),
        scope.paymentNetCents
      ) +
        scope.standaloneNetCents) /
      100;
  }

  const openTaskCount = projectTasks.filter((t) => t.status !== "done").length;
  const forecast = await getProjectForecast({
    projectId,
    dueDate: proj?.dueDate ?? null,
    openTaskCount,
  });

  const computed = computeBlockers({
    rights: rights[0],
    budgets,
    scheduledFunding,
    receivedFunding,
    operationalNeeded,
    operationalAvailable,
    tasks: projectTasks,
    forecast: {
      risk: forecast.risk,
      projectedDate: forecast.projectedDate,
      dueDate: proj?.dueDate ?? null,
    },
    project: { dueDate: proj?.dueDate ?? null, status: proj?.status ?? "planning" },
    today,
    nowMs: Date.now(),
  });

  const health = healthFromBlockers(computed);

  await db.transaction(async (tx) => {
    await tx.delete(blockers).where(eq(blockers.projectId, projectId));
    if (computed.length > 0) {
      await tx.insert(blockers).values(
        computed.map((c) => ({
          projectId,
          type: c.type,
          severity: c.severity,
          title: c.title,
          sourceType: c.sourceType ?? null,
          sourceId: c.sourceId ?? null,
        }))
      );
    }
    await tx
      .update(projects)
      .set({ healthStatus: health, healthComputedAt: new Date() })
      .where(eq(projects.id, projectId));
  });

  // Notify on the transition into a blocked (red) state — once, not on every run.
  if (health === "red" && proj && proj.prevHealth !== "red") {
    const [managers, members] = await Promise.all([
      db
        .select({ id: user.id })
        .from(user)
        .where(
          and(
            inArray(user.role, ["manager", "admin", "super_admin"]),
            eq(user.isBot, false),
            eq(user.isActive, true)
          )
        ),
      db
        .select({ id: projectMembers.userId })
        .from(projectMembers)
        .where(eq(projectMembers.projectId, projectId)),
    ]);
    const recipients = [...managers, ...members].map((r) => r.id);
    const firstCritical = computed.find((c) => c.severity === "critical");
    await notifyMany(recipients, {
      type: "critical_blocker",
      title: `Project blocked: ${proj.title}`,
      body: firstCritical?.title ?? "A critical blocker was detected.",
      link: `/projects/${proj.slug}`,
      data: { projectId },
      email: false,
    });
  }

  return { health, count: computed.length };
}

/**
 * Detached health recompute after a mutation that changes a project's blocker
 * inputs (quote accepted, payment paid, rights updated). Tracked via `after()`
 * so the mutation's response isn't delayed but the work still finishes before
 * the instance may suspend; falls back to a detached promise outside a request
 * context. Keeps RAG dots honest between daily cron runs.
 */
export function scheduleHealthRecompute(projectId: string): void {
  runAfterResponse("health recompute", () =>
    recomputeProjectBlockers(projectId)
  );
}

/** Recompute every project's blockers (used by the daily cron). */
export async function recomputeAllBlockers() {
  const rows = await db.select({ id: projects.id }).from(projects);
  for (const r of rows) {
    await recomputeProjectBlockers(r.id);
  }
  return rows.length;
}
