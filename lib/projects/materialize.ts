import "server-only";

import { addDays } from "date-fns";
import { asc, eq } from "drizzle-orm";

import type { Db } from "@/lib/db";
import {
  phaseTemplates,
  phases,
  projectMembers,
  projectRoles,
  taskTemplates,
  tasks,
  units,
} from "@/lib/db/schema";
import type { ProposedPlan } from "@/lib/ai/types";

/** The transaction handle drizzle passes to db.transaction(...). */
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Materialize a plan template into a project's real phases + tasks. Per-unit task
 * templates fan out one task per chapter/unit; others become a single
 * project-wide task. Due dates are computed from each phase's start + the task's
 * offset; phases run sequentially using their default durations.
 */
export async function materializePlan(
  tx: Tx,
  opts: {
    projectId: string;
    planTemplateId: string;
    unitNames?: string[];
    startDate?: Date;
    createdBy?: string;
  }
) {
  const start = opts.startDate ?? new Date();

  // 1. Units (chapters / episodes), if any.
  const unitRows: { id: string; name: string }[] = [];
  const names = (opts.unitNames ?? [])
    .map((n) => n.trim())
    .filter(Boolean);
  for (let i = 0; i < names.length; i++) {
    const [u] = await tx
      .insert(units)
      .values({ projectId: opts.projectId, name: names[i], orderIndex: i })
      .returning({ id: units.id, name: units.name });
    unitRows.push(u);
  }

  // 2. Walk phase templates in order, instantiating phases + their tasks.
  const pts = await tx
    .select()
    .from(phaseTemplates)
    .where(eq(phaseTemplates.planTemplateId, opts.planTemplateId))
    .orderBy(asc(phaseTemplates.orderIndex));

  let phaseStart = start;

  for (const pt of pts) {
    const phaseDue = pt.defaultDurationDays
      ? addDays(phaseStart, pt.defaultDurationDays)
      : null;

    const [phaseRow] = await tx
      .insert(phases)
      .values({
        projectId: opts.projectId,
        name: pt.name,
        orderIndex: pt.orderIndex,
        color: pt.color,
        startDate: ymd(phaseStart),
        dueDate: phaseDue ? ymd(phaseDue) : null,
        sourcePhaseTemplateId: pt.id,
      })
      .returning({ id: phases.id });

    const tts = await tx
      .select()
      .from(taskTemplates)
      .where(eq(taskTemplates.phaseTemplateId, pt.id))
      .orderBy(asc(taskTemplates.orderIndex));

    let order = 0;
    for (const tt of tts) {
      const due = ymd(addDays(phaseStart, tt.defaultOffsetDays ?? 0));
      const base = {
        projectId: opts.projectId,
        phaseId: phaseRow.id,
        status: "todo" as const,
        priority: "medium" as const,
        dueDate: due,
        createdBy: opts.createdBy,
        sourceTaskTemplateId: tt.id,
      };

      if (tt.isPerUnit && unitRows.length > 0) {
        for (const u of unitRows) {
          await tx.insert(tasks).values({
            ...base,
            unitId: u.id,
            title: `${tt.name} — ${u.name}`,
            description: tt.description,
            orderIndex: order++,
          });
        }
      } else {
        await tx.insert(tasks).values({
          ...base,
          title: tt.name,
          description: tt.description,
          orderIndex: order++,
        });
      }
    }

    if (phaseDue) phaseStart = phaseDue;
  }
}

/**
 * Materialize an AI-generated ProposedPlan (JSON) into real phases + tasks,
 * with per-unit fan-out across the suggested chapters. Mirrors materializePlan
 * but reads from the in-memory plan rather than template tables.
 */
export async function materializeAiPlan(
  tx: Tx,
  opts: {
    projectId: string;
    plan: ProposedPlan;
    startDate?: Date;
    createdBy?: string;
  }
) {
  const start = opts.startDate ?? new Date();

  const unitRows: { id: string; name: string }[] = [];
  const names = (opts.plan.suggestedUnits ?? [])
    .map((n) => n.trim())
    .filter(Boolean);
  for (let i = 0; i < names.length; i++) {
    const [u] = await tx
      .insert(units)
      .values({ projectId: opts.projectId, name: names[i], orderIndex: i })
      .returning({ id: units.id, name: units.name });
    unitRows.push(u);
  }

  let phaseStart = start;
  for (let pi = 0; pi < opts.plan.phases.length; pi++) {
    const ph = opts.plan.phases[pi];
    const phaseDue = ph.durationDays
      ? addDays(phaseStart, ph.durationDays)
      : null;

    const [phaseRow] = await tx
      .insert(phases)
      .values({
        projectId: opts.projectId,
        name: ph.name,
        orderIndex: pi,
        startDate: ymd(phaseStart),
        dueDate: phaseDue ? ymd(phaseDue) : null,
      })
      .returning({ id: phases.id });

    let order = 0;
    for (const t of ph.tasks) {
      const due = ymd(addDays(phaseStart, t.offsetDays ?? 0));
      const base = {
        projectId: opts.projectId,
        phaseId: phaseRow.id,
        status: "todo" as const,
        priority: "medium" as const,
        dueDate: due,
        createdBy: opts.createdBy,
      };
      if (t.isPerUnit && unitRows.length > 0) {
        for (const u of unitRows) {
          await tx.insert(tasks).values({
            ...base,
            unitId: u.id,
            title: `${t.name} — ${u.name}`,
            description: t.description,
            orderIndex: order++,
          });
        }
      } else {
        await tx.insert(tasks).values({
          ...base,
          title: t.name,
          description: t.description,
          orderIndex: order++,
        });
      }
    }

    if (phaseDue) phaseStart = phaseDue;
  }
}

/**
 * Materialize an AI ProposedPlan into an EXISTING project (the pipeline wizard).
 * Reuses the project's chapters if it has any (else creates from suggestedUnits),
 * APPENDS phases after any existing ones, writes each phase's coordinator role +
 * duration, and auto-assigns every task to the project member holding that
 * stage's role (so the per-book coordinator is applied across all chapters).
 */
export async function materializeAiPlanIntoProject(
  tx: Tx,
  opts: {
    projectId: string;
    plan: ProposedPlan;
    startDate?: Date;
    createdBy?: string;
  }
) {
  const { projectId, plan } = opts;

  // Units: reuse existing, else create from the plan's chapter list.
  const existingUnits = await tx
    .select({ id: units.id, name: units.name })
    .from(units)
    .where(eq(units.projectId, projectId))
    .orderBy(asc(units.orderIndex));
  const unitRows = existingUnits.map((u) => ({ id: u.id, name: u.name }));
  if (unitRows.length === 0) {
    const names = (plan.suggestedUnits ?? []).map((n) => n.trim()).filter(Boolean);
    for (let i = 0; i < names.length; i++) {
      const [u] = await tx
        .insert(units)
        .values({ projectId, name: names[i], orderIndex: i })
        .returning({ id: units.id, name: units.name });
      unitRows.push(u);
    }
  }

  // Append after existing phases; anchor at the project start / last phase due.
  const existing = await tx
    .select({ orderIndex: phases.orderIndex, dueDate: phases.dueDate })
    .from(phases)
    .where(eq(phases.projectId, projectId))
    .orderBy(asc(phases.orderIndex));
  const startOrder = existing.length
    ? Math.max(...existing.map((p) => p.orderIndex)) + 1
    : 0;
  const lastDue = existing
    .map((p) => p.dueDate)
    .filter((d): d is string => !!d)
    .sort()
    .at(-1);
  let phaseStart = opts.startDate ?? (lastDue ? new Date(lastDue) : new Date());

  // Role → {id, default duration}; role → coordinator user.
  const roleRows = await tx
    .select({
      id: projectRoles.id,
      key: projectRoles.key,
      dur: projectRoles.defaultDurationDays,
    })
    .from(projectRoles);
  const roleByKey = new Map(roleRows.map((r) => [r.key, r]));
  const memberRows = await tx
    .select({ userId: projectMembers.userId, roleKey: projectRoles.key })
    .from(projectMembers)
    .innerJoin(projectRoles, eq(projectRoles.id, projectMembers.projectRoleId))
    .where(eq(projectMembers.projectId, projectId));
  const userByRole = new Map<string, string>();
  for (const m of memberRows) {
    if (!userByRole.has(m.roleKey)) userByRole.set(m.roleKey, m.userId);
  }

  for (let pi = 0; pi < plan.phases.length; pi++) {
    const ph = plan.phases[pi];
    const role = ph.roleKey ? roleByKey.get(ph.roleKey) : undefined;
    const durationDays = ph.durationDays ?? role?.dur ?? null;
    const phaseDue = durationDays ? addDays(phaseStart, durationDays) : null;

    const [phaseRow] = await tx
      .insert(phases)
      .values({
        projectId,
        name: ph.name,
        orderIndex: startOrder + pi,
        projectRoleId: role?.id ?? null,
        durationDays,
        startDate: ymd(phaseStart),
        dueDate: phaseDue ? ymd(phaseDue) : null,
      })
      .returning({ id: phases.id });

    let order = 0;
    for (const t of ph.tasks) {
      const taskRoleKey = t.roleKey ?? ph.roleKey;
      const assignedTo = taskRoleKey ? userByRole.get(taskRoleKey) ?? null : null;
      const due = ymd(addDays(phaseStart, t.offsetDays ?? 0));
      const base = {
        projectId,
        phaseId: phaseRow.id,
        status: "todo" as const,
        priority: "medium" as const,
        dueDate: due,
        assignedTo,
        createdBy: opts.createdBy,
      };
      if (t.isPerUnit && unitRows.length > 0) {
        for (const u of unitRows) {
          await tx.insert(tasks).values({
            ...base,
            unitId: u.id,
            title: `${t.name} — ${u.name}`,
            description: t.description,
            orderIndex: order++,
          });
        }
      } else {
        await tx.insert(tasks).values({
          ...base,
          title: t.name,
          description: t.description,
          orderIndex: order++,
        });
      }
    }
    if (phaseDue) phaseStart = phaseDue;
  }
}
