import "server-only";

import { and, eq, isNotNull, isNull, ne } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";

import { db } from "@/lib/db";
import {
  licenseFeePayments,
  mouPayments,
  printPayments,
  projects,
  rightsItems,
  royaltyPayments,
  sharedMouGroups,
  tasks,
  user,
} from "@/lib/db/schema";
import { dayDiff, type AgendaItem } from "./bucket";
import { getWorkspaceSettings } from "@/lib/workspace/queries";
import { canManage } from "@/lib/auth/policy";

/** Today (yyyy-mm-dd) in the requested workspace/user timezone. */
export function agendaToday(now = new Date(), timezone = "UTC"): string {
  return formatInTimeZone(now, timezone, "yyyy-MM-dd");
}

function projectHref(slug: string | null, tab: string): string {
  return slug ? `/projects/${slug}/${tab}` : "/tasks?view=agenda";
}

/**
 * Cross-project agenda: every dated obligation a user should see, unbucketed.
 * Role-aware — members see only their own open tasks; managers/admins also see
 * money (MoU/royalty/license-fee/print payments), rights expiries/renewals, and
 * project due dates across the portfolio. `horizonDays` (if given) keeps only
 * items due within the horizon (overdue items are always kept).
 */
export async function getAgendaItems(opts: {
  userId: string;
  role: string;
  horizonDays?: number;
  now?: Date;
}): Promise<AgendaItem[]> {
  const isManager = canManage(opts.role);
  const workspace = await getWorkspaceSettings();
  const today = agendaToday(opts.now, workspace.timezone);
  const items: AgendaItem[] = [];

  // ── Everyone: own open tasks + milestones with a due date ──────────────────
  const myTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      dueDate: tasks.dueDate,
      isMilestone: tasks.isMilestone,
      projectId: tasks.projectId,
      slug: projects.slug,
      projectTitle: projects.title,
    })
    .from(tasks)
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .where(
      and(
        eq(tasks.assignedTo, opts.userId),
        ne(tasks.status, "done"),
        isNotNull(tasks.dueDate)
      )
    );
  for (const t of myTasks) {
    items.push({
      id: `task:${t.id}`,
      kind: t.isMilestone ? "milestone" : "task",
      title: t.title,
      date: t.dueDate!,
      projectId: t.projectId,
      projectSlug: t.slug,
      projectTitle: t.projectTitle,
      amount: null,
      currency: null,
      assigneeName: null,
      href: t.projectId
        ? `${projectHref(t.slug, "tasks")}?task=${t.id}`
        : `/tasks?task=${t.id}`,
    });
  }

  if (isManager) {
    // ── MoU payments (money in) ──────────────────────────────────────────────
    const mous = await db
      .select({
        id: mouPayments.id,
        amount: mouPayments.amount,
        currency: mouPayments.currency,
        dueDate: mouPayments.dueDate,
        projectId: mouPayments.projectId,
        slug: projects.slug,
        projectTitle: projects.title,
        groupId: mouPayments.sharedMouGroupId,
        groupName: sharedMouGroups.name,
      })
      .from(mouPayments)
      .innerJoin(projects, eq(projects.id, mouPayments.projectId))
      .leftJoin(
        sharedMouGroups,
        eq(sharedMouGroups.id, mouPayments.sharedMouGroupId)
      )
      .where(and(isNotNull(mouPayments.dueDate), isNull(mouPayments.paidAt)));
    for (const p of mous) {
      items.push({
        id: `mou_payment:${p.id}`,
        kind: "mou_payment",
        title: `MoU payment · ${p.groupName ?? p.projectTitle}`,
        date: p.dueDate!,
        projectId: p.groupId ? null : p.projectId,
        projectSlug: p.groupId ? null : p.slug,
        projectTitle: p.groupName ?? p.projectTitle,
        amount: p.amount,
        currency: p.currency,
        assigneeName: null,
        href: p.groupId ? `/agreements/${p.groupId}` : projectHref(p.slug, "budget"),
      });
    }

    // ── Royalty payments (money out) ─────────────────────────────────────────
    const royalties = await db
      .select({
        id: royaltyPayments.id,
        amount: royaltyPayments.amount,
        currency: royaltyPayments.currency,
        dueDate: royaltyPayments.dueDate,
        period: royaltyPayments.period,
        projectId: royaltyPayments.projectId,
        slug: projects.slug,
        projectTitle: projects.title,
        assigneeName: user.name,
      })
      .from(royaltyPayments)
      .innerJoin(projects, eq(projects.id, royaltyPayments.projectId))
      .leftJoin(user, eq(user.id, royaltyPayments.assigneeId))
      .where(and(isNotNull(royaltyPayments.dueDate), isNull(royaltyPayments.paidAt)));
    for (const p of royalties) {
      items.push({
        id: `royalty_payment:${p.id}`,
        kind: "royalty_payment",
        title: `Royalty (${p.period}) · ${p.projectTitle}`,
        date: p.dueDate!,
        projectId: p.projectId,
        projectSlug: p.slug,
        projectTitle: p.projectTitle,
        amount: p.amount,
        currency: p.currency,
        assigneeName: p.assigneeName,
        href: projectHref(p.slug, "budget"),
      });
    }

    // ── License fee payments (money out) ─────────────────────────────────────
    const licenseFees = await db
      .select({
        id: licenseFeePayments.id,
        amount: licenseFeePayments.amount,
        currency: licenseFeePayments.currency,
        dueDate: licenseFeePayments.dueDate,
        projectId: licenseFeePayments.projectId,
        slug: projects.slug,
        projectTitle: projects.title,
        assigneeName: user.name,
      })
      .from(licenseFeePayments)
      .innerJoin(projects, eq(projects.id, licenseFeePayments.projectId))
      .leftJoin(user, eq(user.id, licenseFeePayments.assigneeId))
      .where(
        and(isNotNull(licenseFeePayments.dueDate), isNull(licenseFeePayments.paidAt))
      );
    for (const p of licenseFees) {
      items.push({
        id: `license_fee:${p.id}`,
        kind: "license_fee",
        title: `License fee · ${p.projectTitle}`,
        date: p.dueDate!,
        projectId: p.projectId,
        projectSlug: p.slug,
        projectTitle: p.projectTitle,
        amount: p.amount,
        currency: p.currency,
        assigneeName: p.assigneeName,
        href: projectHref(p.slug, "rights"),
      });
    }

    // ── Print payments (money out) ───────────────────────────────────────────
    const prints = await db
      .select({
        id: printPayments.id,
        kind: printPayments.kind,
        amount: printPayments.amount,
        currency: printPayments.currency,
        dueDate: printPayments.dueDate,
        neededByDate: printPayments.neededByDate,
        projectId: printPayments.projectId,
        slug: projects.slug,
        projectTitle: projects.title,
      })
      .from(printPayments)
      .innerJoin(projects, eq(projects.id, printPayments.projectId))
      .where(isNull(printPayments.paidAt));
    for (const p of prints) {
      const date = p.dueDate ?? p.neededByDate;
      if (!date) continue;
      items.push({
        id: `print_payment:${p.id}`,
        kind: "print_payment",
        title: `Print ${p.kind} payment · ${p.projectTitle}`,
        date,
        projectId: p.projectId,
        projectSlug: p.slug,
        projectTitle: p.projectTitle,
        amount: p.amount,
        currency: p.currency,
        assigneeName: null,
        href: projectHref(p.slug, "print"),
      });
    }

    // ── Rights: license renewals, MoU expiries, complete-by ──────────────────
    const rights = await db
      .select({
        projectId: rightsItems.projectId,
        licenseExpiresDate: rightsItems.licenseExpiresDate,
        licenseAutoRenews: rightsItems.licenseAutoRenews,
        licenseStatus: rightsItems.licenseStatus,
        mouExpiresDate: rightsItems.mouExpiresDate,
        mouStatus: rightsItems.mouStatus,
        completeByDate: rightsItems.completeByDate,
        overallStatus: rightsItems.overallStatus,
        slug: projects.slug,
        projectTitle: projects.title,
      })
      .from(rightsItems)
      .innerJoin(projects, eq(projects.id, rightsItems.projectId));
    for (const r of rights) {
      if (r.licenseExpiresDate && !r.licenseAutoRenews && r.licenseStatus === "signed") {
        items.push({
          id: `license_renewal:${r.projectId}`,
          kind: "license_renewal",
          title: `License expires · ${r.projectTitle}`,
          date: r.licenseExpiresDate,
          projectId: r.projectId,
          projectSlug: r.slug,
          projectTitle: r.projectTitle,
          amount: null,
          currency: null,
          assigneeName: null,
          href: projectHref(r.slug, "rights"),
        });
      }
      if (r.mouExpiresDate && r.mouStatus === "signed") {
        items.push({
          id: `mou_expiry:${r.projectId}`,
          kind: "mou_expiry",
          title: `MoU expires · ${r.projectTitle}`,
          date: r.mouExpiresDate,
          projectId: r.projectId,
          projectSlug: r.slug,
          projectTitle: r.projectTitle,
          amount: null,
          currency: null,
          assigneeName: null,
          href: projectHref(r.slug, "rights"),
        });
      }
      if (r.completeByDate && r.overallStatus !== "complete") {
        items.push({
          id: `rights_complete_by:${r.projectId}`,
          kind: "rights_complete_by",
          title: `Rights needed by · ${r.projectTitle}`,
          date: r.completeByDate,
          projectId: r.projectId,
          projectSlug: r.slug,
          projectTitle: r.projectTitle,
          amount: null,
          currency: null,
          assigneeName: null,
          href: projectHref(r.slug, "rights"),
        });
      }
    }

    // ── Project due dates (active/planning) ──────────────────────────────────
    const dueProjects = await db
      .select({
        id: projects.id,
        title: projects.title,
        slug: projects.slug,
        dueDate: projects.dueDate,
        status: projects.status,
      })
      .from(projects)
      .where(isNotNull(projects.dueDate));
    for (const p of dueProjects) {
      if (p.status !== "active" && p.status !== "planning") continue;
      items.push({
        id: `project_due:${p.id}`,
        kind: "project_due",
        title: `Project due · ${p.title}`,
        date: p.dueDate!,
        projectId: p.id,
        projectSlug: p.slug,
        projectTitle: p.title,
        amount: null,
        currency: null,
        assigneeName: null,
        href: `/projects/${p.slug}`,
      });
    }
  }

  if (opts.horizonDays != null) {
    const horizon = opts.horizonDays;
    return items.filter((i) => dayDiff(today, i.date) <= horizon);
  }
  return items;
}
