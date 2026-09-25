import "server-only";

import ExcelJS from "exceljs";
import { and, eq, gte, isNotNull, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/lib/db";
import {
  projects,
  rightsHolders,
  rightsItems,
  tasks,
  timeEntries,
  user,
} from "@/lib/db/schema";
import {
  listProjectBlockerSummaries,
  listProjectBudgetTotals,
  listProjectRightsStatus,
  listProjects,
} from "@/lib/projects/queries";
import { getProjectForecasts } from "@/lib/forecast/queries";

function sheetWithHeader(
  wb: ExcelJS.Workbook,
  name: string,
  columns: { header: string; key: string; width: number }[]
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columns;
  ws.getRow(1).font = { bold: true };
  return ws;
}

/** Portfolio: one row per project mirroring the /overview table. */
export async function buildPortfolioWorkbook(): Promise<ExcelJS.Workbook> {
  const [rows, budgetTotals, rightsStatus, blockerSummaries] = await Promise.all([
    listProjects(),
    listProjectBudgetTotals(),
    listProjectRightsStatus(),
    listProjectBlockerSummaries(),
  ]);
  const forecasts = await getProjectForecasts(
    rows.map((p) => ({
      id: p.id,
      dueDate: p.dueDate,
      totalTasks: p.totalTasks,
      doneTasks: p.doneTasks,
    }))
  );
  const budgetMap = new Map(budgetTotals.map((b) => [b.projectId, b]));
  const rightsMap = new Map(rightsStatus.map((r) => [r.projectId, r]));
  const blockerMap = new Map(blockerSummaries.map((b) => [b.projectId, b]));

  const wb = new ExcelJS.Workbook();
  wb.creator = "Sastra";
  const ws = sheetWithHeader(wb, "Portfolio", [
    { header: "Project", key: "title", width: 34 },
    { header: "Status", key: "status", width: 12 },
    { header: "Health", key: "health", width: 10 },
    { header: "Progress %", key: "progress", width: 11 },
    { header: "Tasks done", key: "done", width: 11 },
    { header: "Tasks total", key: "total", width: 11 },
    { header: "Blockers", key: "blockers", width: 9 },
    { header: "Critical", key: "critical", width: 9 },
    { header: "Needed", key: "needed", width: 12 },
    { header: "Raised", key: "secured", width: 12 },
    { header: "To raise", key: "toRaise", width: 12 },
    { header: "Currency", key: "currency", width: 9 },
    { header: "Start", key: "start", width: 11 },
    { header: "Due", key: "due", width: 11 },
    { header: "Forecast", key: "forecast", width: 12 },
    { header: "Projected finish", key: "projected", width: 15 },
    { header: "Rights", key: "rights", width: 12 },
  ]);

  for (const p of rows) {
    const b = budgetMap.get(p.id);
    const needed = b?.needed ?? 0;
    const secured = b?.secured ?? 0;
    const f = forecasts.get(p.id);
    ws.addRow({
      title: p.title,
      status: p.status,
      health: p.healthStatus ?? "",
      progress: p.totalTasks ? Math.round((p.doneTasks / p.totalTasks) * 100) : 0,
      done: p.doneTasks,
      total: p.totalTasks,
      blockers: blockerMap.get(p.id)?.total ?? p.blockerCount,
      critical: blockerMap.get(p.id)?.critical ?? 0,
      needed,
      secured,
      toRaise: Math.max(0, needed - secured),
      currency: b?.currency ?? "USD",
      start: p.startDate ?? "",
      due: p.dueDate ?? "",
      forecast: f?.risk ?? "unknown",
      projected: f?.projectedDate ?? "",
      rights: rightsMap.get(p.id)?.overallStatus ?? "none",
    });
  }
  return wb;
}

/** Rights: one row per project's rights item with expiry/renewal dates. */
export async function buildRightsWorkbook(): Promise<ExcelJS.Workbook> {
  const mouHolder = alias(rightsHolders, "mou_holder");
  const licenseHolder = alias(rightsHolders, "license_holder");
  const rows = await db
    .select({
      projectTitle: projects.title,
      projectStatus: projects.status,
      mouHolder: mouHolder.name,
      mouStatus: rightsItems.mouStatus,
      mouSignedDate: rightsItems.mouSignedDate,
      mouExpiresDate: rightsItems.mouExpiresDate,
      licenseHolder: licenseHolder.name,
      licenseStatus: rightsItems.licenseStatus,
      licenseSignedDate: rightsItems.licenseSignedDate,
      licenseExpiresDate: rightsItems.licenseExpiresDate,
      licenseAutoRenews: rightsItems.licenseAutoRenews,
      licenseFeeDueDate: rightsItems.licenseFeeDueDate,
      completeByDate: rightsItems.completeByDate,
      overallStatus: rightsItems.overallStatus,
    })
    .from(rightsItems)
    .innerJoin(projects, eq(projects.id, rightsItems.projectId))
    .leftJoin(mouHolder, eq(mouHolder.id, rightsItems.mouHolderId))
    .leftJoin(licenseHolder, eq(licenseHolder.id, rightsItems.licenseHolderId))
    .orderBy(projects.title);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Sastra";
  const ws = sheetWithHeader(wb, "Rights", [
    { header: "Project", key: "project", width: 34 },
    { header: "Project status", key: "pstatus", width: 13 },
    { header: "Overall", key: "overall", width: 12 },
    { header: "MoU holder", key: "mouHolder", width: 22 },
    { header: "MoU status", key: "mouStatus", width: 12 },
    { header: "MoU signed", key: "mouSigned", width: 12 },
    { header: "MoU expires", key: "mouExpires", width: 12 },
    { header: "License holder", key: "licHolder", width: 22 },
    { header: "License status", key: "licStatus", width: 13 },
    { header: "License signed", key: "licSigned", width: 13 },
    { header: "License expires", key: "licExpires", width: 14 },
    { header: "Auto-renews", key: "auto", width: 12 },
    { header: "Fee due", key: "feeDue", width: 12 },
    { header: "Complete by", key: "completeBy", width: 12 },
  ]);
  for (const r of rows) {
    ws.addRow({
      project: r.projectTitle,
      pstatus: r.projectStatus,
      overall: r.overallStatus,
      mouHolder: r.mouHolder ?? "",
      mouStatus: r.mouStatus,
      mouSigned: r.mouSignedDate ?? "",
      mouExpires: r.mouExpiresDate ?? "",
      licHolder: r.licenseHolder ?? "",
      licStatus: r.licenseStatus,
      licSigned: r.licenseSignedDate ?? "",
      licExpires: r.licenseExpiresDate ?? "",
      auto: r.licenseAutoRenews ? "yes" : "no",
      feeDue: r.licenseFeeDueDate ?? "",
      completeBy: r.completeByDate ?? "",
    });
  }
  return wb;
}

function isoWeek(d: Date): string {
  // ISO week label yyyy-Www (UTC).
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Time: person × project × ISO week hours, plus per-task estimate vs tracked. */
export async function buildTimeWorkbook(range: {
  from?: string;
  to?: string;
}): Promise<ExcelJS.Workbook> {
  const conds = [isNotNull(timeEntries.durationSeconds)];
  if (range.from) conds.push(gte(timeEntries.startedAt, new Date(`${range.from}T00:00:00Z`)));
  if (range.to) conds.push(lte(timeEntries.startedAt, new Date(`${range.to}T23:59:59Z`)));

  const rows = await db
    .select({
      userName: user.name,
      taskId: tasks.id,
      taskTitle: tasks.title,
      estimateHours: tasks.estimateHours,
      projectTitle: projects.title,
      startedAt: timeEntries.startedAt,
      durationSeconds: timeEntries.durationSeconds,
    })
    .from(timeEntries)
    .innerJoin(user, eq(user.id, timeEntries.userId))
    .innerJoin(tasks, eq(tasks.id, timeEntries.taskId))
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(...conds));

  const wb = new ExcelJS.Workbook();
  wb.creator = "Sastra";

  // Sheet 1: person × project × week
  const weekly = new Map<
    string,
    { person: string; project: string; week: string; seconds: number }
  >();
  for (const r of rows) {
    const project = r.projectTitle ?? "(no project)";
    const week = isoWeek(r.startedAt);
    const key = `${r.userName}|${project}|${week}`;
    const entry = weekly.get(key) ?? {
      person: r.userName,
      project,
      week,
      seconds: 0,
    };
    entry.seconds += r.durationSeconds ?? 0;
    weekly.set(key, entry);
  }
  const ws1 = sheetWithHeader(wb, "Weekly", [
    { header: "Person", key: "person", width: 22 },
    { header: "Project", key: "project", width: 34 },
    { header: "Week", key: "week", width: 10 },
    { header: "Hours", key: "hours", width: 9 },
  ]);
  for (const e of [...weekly.values()].sort(
    (a, b) =>
      a.person.localeCompare(b.person) ||
      a.week.localeCompare(b.week) ||
      a.project.localeCompare(b.project)
  )) {
    ws1.addRow({
      person: e.person,
      project: e.project,
      week: e.week,
      hours: Math.round((e.seconds / 3600) * 100) / 100,
    });
  }

  // Sheet 2: per task, estimate vs tracked (only tasks with tracked time).
  const byTask = new Map<
    string,
    { task: string; project: string; estimate: number | null; seconds: number }
  >();
  for (const r of rows) {
    const entry = byTask.get(r.taskId) ?? {
      task: r.taskTitle,
      project: r.projectTitle ?? "(no project)",
      estimate: r.estimateHours != null ? Number(r.estimateHours) : null,
      seconds: 0,
    };
    entry.seconds += r.durationSeconds ?? 0;
    byTask.set(r.taskId, entry);
  }
  const ws2 = sheetWithHeader(wb, "By task", [
    { header: "Task", key: "task", width: 40 },
    { header: "Project", key: "project", width: 34 },
    { header: "Estimate (h)", key: "estimate", width: 12 },
    { header: "Tracked (h)", key: "tracked", width: 12 },
    { header: "Delta (h)", key: "delta", width: 10 },
  ]);
  for (const t of [...byTask.values()].sort((a, b) =>
    a.project.localeCompare(b.project)
  )) {
    const tracked = Math.round((t.seconds / 3600) * 100) / 100;
    ws2.addRow({
      task: t.task,
      project: t.project,
      estimate: t.estimate ?? "",
      tracked,
      delta: t.estimate != null ? Math.round((tracked - t.estimate) * 100) / 100 : "",
    });
  }

  return wb;
}
