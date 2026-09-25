import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";

import { db } from "@/lib/db";
import {
  standupReports,
  standupRuns,
  standups,
  user,
} from "@/lib/db/schema";

export type ReportPerson = {
  userName: string;
  status: string;
  stuckRisk: string;
  impediments: string[];
  reasoning: string;
};

export type StandupViewItem = {
  id: string;
  name: string;
  timezone: string;
  localDate: string;
  runs: { userName: string; status: string }[];
  report: { runDate: string; people: ReportPerson[] } | null;
};

export async function getMyOpenStandup(userId: string) {
  const [run] = await db
    .select({
      channelId: standupRuns.channelId,
      name: standups.name,
    })
    .from(standupRuns)
    .innerJoin(standups, eq(standups.id, standupRuns.standupId))
    .where(
      and(eq(standupRuns.userId, userId), eq(standupRuns.status, "in_progress"))
    )
    .orderBy(desc(standupRuns.runDate))
    .limit(1);
  return run ?? null;
}

export async function getStandupView(now = new Date()): Promise<StandupViewItem[]> {
  const all = await db.select().from(standups).orderBy(standups.name);
  const out: StandupViewItem[] = [];

  for (const s of all) {
    const localDate = formatInTimeZone(now, s.timezone, "yyyy-MM-dd");
    const runs = await db
      .select({ userName: user.name, status: standupRuns.status })
      .from(standupRuns)
      .innerJoin(user, eq(user.id, standupRuns.userId))
      .where(and(eq(standupRuns.standupId, s.id), eq(standupRuns.runDate, localDate)));

    const [report] = await db
      .select({ runDate: standupReports.runDate, summary: standupReports.summary })
      .from(standupReports)
      .where(eq(standupReports.standupId, s.id))
      .orderBy(desc(standupReports.runDate))
      .limit(1);

    out.push({
      id: s.id,
      name: s.name,
      timezone: s.timezone,
      localDate,
      runs,
      report: report
        ? {
            runDate: report.runDate,
            people:
              (report.summary as { people?: ReportPerson[] })?.people ?? [],
          }
        : null,
    });
  }
  return out;
}
