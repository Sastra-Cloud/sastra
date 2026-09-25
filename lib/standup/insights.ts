import "server-only";

import { and, eq, inArray, ne } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  standupAnswers,
  standupQuestions,
  standupReports,
  standupRuns,
  standups,
  tasks,
  user,
} from "@/lib/db/schema";
import { notifyMany } from "@/lib/notifications";
import { aiStructured } from "@/lib/ai/openrouter";
import { resolveOpenRouterApiKey } from "@/lib/ai/keys";
import { formatInTimeZone } from "date-fns-tz";
import { z } from "zod";
import { heuristic } from "@/lib/standup/heuristic";

const standupInsightSchema = z.object({
  impediments: z.array(z.string()),
  stuckRisk: z.enum(["low", "medium", "high"]),
  reasoning: z.string(),
});

type PersonInsight = {
  userId: string;
  userName: string;
  status: string;
  impediments: string[];
  stuckRisk: "low" | "medium" | "high";
  reasoning: string;
};

async function taskTelemetry(userId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const open = await db
    .select({
      status: tasks.status,
      dueDate: tasks.dueDate,
      updatedAt: tasks.updatedAt,
    })
    .from(tasks)
    .where(and(eq(tasks.assignedTo, userId), ne(tasks.status, "done")));
  let overdue = 0;
  let stalled = 0;
  for (const t of open) {
    if (t.dueDate && t.dueDate < today) overdue += 1;
    if (
      t.status === "in_progress" &&
      Date.now() - new Date(t.updatedAt).getTime() > 5 * 86_400_000
    )
      stalled += 1;
  }
  return { open: open.length, overdue, stalled };
}

async function analyzeParticipant(
  userId: string,
  userName: string,
  status: string,
  answers: { prompt: string; content: string }[]
): Promise<PersonInsight> {
  const tele = await taskTelemetry(userId);
  const base = heuristic(status, answers, tele);

  // Enrich with AI if configured; fall back to the heuristic on any error.
  if (status !== "missed" && (await resolveOpenRouterApiKey())) {
    try {
      const raw = await aiStructured(
        "standup_insights",
        [
          {
            role: "system",
            content:
              "You analyze a team member's daily standup for a publishing team. Identify concrete impediments and judge whether they appear stuck. Combine their answers with task telemetry. Respond as JSON.",
          },
          {
            role: "user",
            content: `Standup answers:\n${answers
              .map((a) => `${a.prompt}\n${a.content}`)
              .join("\n\n")}\n\nTask telemetry: ${tele.open} open, ${tele.overdue} overdue, ${tele.stalled} stalled.`,
          },
        ],
        {
          name: "standup_insight",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["impediments", "stuckRisk", "reasoning"],
            properties: {
              impediments: { type: "array", items: { type: "string" } },
              stuckRisk: { type: "string", enum: ["low", "medium", "high"] },
              reasoning: { type: "string" },
            },
          },
        },
        {
          metering: {
            scope: "workspace",
            feature: "standup",
            operation: "analyze_participant",
            entityType: "user",
            entityId: userId,
            metadata: {
              analyzedUserId: userId,
              status,
              answerCount: answers.length,
              openTasks: tele.open,
              overdueTasks: tele.overdue,
              stalledTasks: tele.stalled,
            },
          },
        }
      );
      // Validate at the boundary — a fallback model returning loose output must
      // not slip through. On any mismatch, fall back to the heuristic baseline.
      const parsed = standupInsightSchema.safeParse(raw);
      if (parsed.success) {
        return {
          userId,
          userName,
          status,
          impediments: parsed.data.impediments.length
            ? parsed.data.impediments
            : base.impediments,
          stuckRisk: parsed.data.stuckRisk,
          reasoning: parsed.data.reasoning || base.reasoning,
        };
      }
    } catch {
      // fall through to heuristic
    }
  }

  return { userId, userName, status, ...base };
}

/** Cron: for each standup whose day has resolved, generate + deliver a report. */
export async function generateDueReports(now = new Date()): Promise<number> {
  const all = await db.select().from(standups);
  let generated = 0;

  for (const s of all) {
    const localDate = formatInTimeZone(now, s.timezone, "yyyy-MM-dd");
    const runs = await db
      .select({
        id: standupRuns.id,
        userId: standupRuns.userId,
        userName: user.name,
        status: standupRuns.status,
      })
      .from(standupRuns)
      .innerJoin(user, eq(user.id, standupRuns.userId))
      .where(and(eq(standupRuns.standupId, s.id), eq(standupRuns.runDate, localDate)));
    if (runs.length === 0) continue;
    if (runs.some((r) => r.status === "in_progress")) continue; // not resolved yet

    const [existing] = await db
      .select({ id: standupReports.id })
      .from(standupReports)
      .where(
        and(
          eq(standupReports.standupId, s.id),
          eq(standupReports.runDate, localDate)
        )
      )
      .limit(1);
    if (existing) continue;

    const questions = await db
      .select()
      .from(standupQuestions)
      .where(eq(standupQuestions.standupId, s.id));
    const qById = new Map(questions.map((q) => [q.id, q.prompt]));

    const people: PersonInsight[] = [];
    for (const r of runs) {
      const ans = await db
        .select()
        .from(standupAnswers)
        .where(eq(standupAnswers.runId, r.id));
      const answers = ans.map((a) => ({
        prompt: a.questionId ? (qById.get(a.questionId) ?? "") : "",
        content: a.content,
      }));
      people.push(
        await analyzeParticipant(r.userId, r.userName, r.status, answers)
      );
    }

    await db.insert(standupReports).values({
      standupId: s.id,
      runDate: localDate,
      summary: { date: localDate, people },
    });
    generated += 1;

    // Deliver to the reviewer + managers.
    const managers = await db
      .select({ id: user.id })
      .from(user)
      .where(
        and(
          inArray(user.role, ["manager", "admin", "super_admin"]),
          eq(user.isBot, false),
          eq(user.isActive, true)
        )
      );
    const recipients = [
      ...(s.reportToUserId ? [s.reportToUserId] : []),
      ...managers.map((m) => m.id),
    ];
    const flagged = people.filter((p) => p.stuckRisk !== "low");
    await notifyMany(recipients, {
      type: "standup_digest",
      title: `Standup summary: ${s.name}`,
      body: flagged.length
        ? `${flagged.length} ${flagged.length === 1 ? "person may" : "people may"} need attention: ${flagged.map((f) => f.userName).join(", ")}`
        : "No concerns were flagged in this standup.",
      link: "/standups",
      data: { standupId: s.id, runDate: localDate },
    });
  }

  return generated;
}
