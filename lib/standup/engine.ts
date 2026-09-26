import "server-only";

import { and, asc, desc, eq, isNotNull, lt, sql } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";
import { uuidv7 } from "uuidv7";

import { db } from "@/lib/db";
import {
  chatChannelMembers,
  chatChannels,
  chatMessages,
  standupAnswers,
  standupParticipants,
  standupQuestions,
  standupRuns,
  standups,
  user,
} from "@/lib/db/schema";
import { notify } from "@/lib/notifications";

const BOT_ID = "standup-bot";

async function botPost(channelId: string, content: string) {
  await db.insert(chatMessages).values({
    id: uuidv7(),
    channelId,
    userId: BOT_ID,
    content,
    status: "sent",
  });
}

/**
 * A standup conversation is private to the person answering it: they are its
 * only member, and member-scoped channels are closed to everyone else.
 */
async function ensureMember(channelId: string, userId: string) {
  await db
    .insert(chatChannelMembers)
    .values({ channelId, userId })
    .onConflictDoNothing({
      target: [chatChannelMembers.channelId, chatChannelMembers.userId],
    });
}

/** Find this participant's existing standup channel, or create one. */
async function ensureChannel(
  standupId: string,
  standupName: string,
  userId: string,
  userName: string
): Promise<string> {
  const [prior] = await db
    .select({ channelId: standupRuns.channelId })
    .from(standupRuns)
    .where(
      and(
        eq(standupRuns.standupId, standupId),
        eq(standupRuns.userId, userId),
        isNotNull(standupRuns.channelId)
      )
    )
    .orderBy(desc(standupRuns.runDate))
    .limit(1);
  if (prior?.channelId) {
    await ensureMember(prior.channelId, userId);
    return prior.channelId;
  }

  const [c] = await db
    .insert(chatChannels)
    .values({ name: `${standupName} · ${userName}`, kind: "standup" })
    .returning({ id: chatChannels.id });
  await ensureMember(c.id, userId);
  return c.id;
}

type StandupRow = typeof standups.$inferSelect;

async function startForParticipant(
  standup: StandupRow,
  participant: { userId: string; userName: string },
  runDate: string,
  firstQuestion: string
) {
  const existing = await db
    .select({ id: standupRuns.id })
    .from(standupRuns)
    .where(
      and(
        eq(standupRuns.standupId, standup.id),
        eq(standupRuns.userId, participant.userId),
        eq(standupRuns.runDate, runDate)
      )
    )
    .limit(1);
  if (existing.length > 0) return;

  const channelId = await ensureChannel(
    standup.id,
    standup.name,
    participant.userId,
    participant.userName
  );

  await db.insert(standupRuns).values({
    standupId: standup.id,
    userId: participant.userId,
    channelId,
    runDate,
    status: "in_progress",
    currentQuestionIndex: 0,
    startedAt: new Date(),
  });

  const first = participant.userName.split(" ")[0];
  await botPost(
    channelId,
    `Hello ${first}, time for today's standup on ${standup.name}.\n\n${firstQuestion}`
  );
  await notify({
    userId: participant.userId,
    type: "standup",
    title: `Standup: ${standup.name}`,
    body: "Time for your daily standup — tap to answer.",
    link: `/chat/${channelId}`,
    email: false,
  });
}

async function participantsWithQuestions(standupId: string) {
  const [participants, questions] = await Promise.all([
    db
      .select({ userId: standupParticipants.userId, userName: user.name })
      .from(standupParticipants)
      .innerJoin(user, eq(user.id, standupParticipants.userId))
      .where(eq(standupParticipants.standupId, standupId)),
    db
      .select()
      .from(standupQuestions)
      .where(eq(standupQuestions.standupId, standupId))
      .orderBy(asc(standupQuestions.orderIndex)),
  ]);
  return { participants, questions };
}

/** Cron: start any standups whose local scheduled time has arrived today. */
export async function startDueStandups(now = new Date()): Promise<number> {
  const active = await db
    .select()
    .from(standups)
    .where(eq(standups.isActive, true));
  let started = 0;

  for (const s of active) {
    const localDate = formatInTimeZone(now, s.timezone, "yyyy-MM-dd");
    const localTime = formatInTimeZone(now, s.timezone, "HH:mm");
    const dow = Number(formatInTimeZone(now, s.timezone, "i")) % 7; // 0=Sun..6=Sat
    if (!s.scheduleDays.includes(dow)) continue;
    if (localTime < s.scheduleTime) continue;

    // Already started today?
    const [run] = await db
      .select({ id: standupRuns.id })
      .from(standupRuns)
      .where(and(eq(standupRuns.standupId, s.id), eq(standupRuns.runDate, localDate)))
      .limit(1);
    if (run) continue;

    const { participants, questions } = await participantsWithQuestions(s.id);
    if (participants.length === 0 || questions.length === 0) continue;
    for (const p of participants) {
      await startForParticipant(s, p, localDate, questions[0].prompt);
      started += 1;
    }
  }
  return started;
}

/** Manager action: start a standup immediately (today, ignoring the schedule). */
export async function startStandupNow(standupId: string) {
  const [s] = await db.select().from(standups).where(eq(standups.id, standupId)).limit(1);
  if (!s) return;
  const localDate = formatInTimeZone(new Date(), s.timezone, "yyyy-MM-dd");
  const { participants, questions } = await participantsWithQuestions(s.id);
  if (questions.length === 0) return;
  for (const p of participants) {
    await startForParticipant(s, p, localDate, questions[0].prompt);
  }
}

/** Called from postMessage when a user replies in their standup channel. */
export async function handleStandupAnswer(
  channelId: string,
  userId: string,
  content: string
) {
  const [run] = await db
    .select()
    .from(standupRuns)
    .where(
      and(
        eq(standupRuns.channelId, channelId),
        eq(standupRuns.userId, userId),
        eq(standupRuns.status, "in_progress")
      )
    )
    .orderBy(desc(standupRuns.runDate))
    .limit(1);
  if (!run) return;

  const questions = await db
    .select()
    .from(standupQuestions)
    .where(eq(standupQuestions.standupId, run.standupId))
    .orderBy(asc(standupQuestions.orderIndex));

  const idx = run.currentQuestionIndex;
  await db.insert(standupAnswers).values({
    runId: run.id,
    questionId: questions[idx]?.id,
    content,
  });

  const nextIdx = idx + 1;
  if (nextIdx < questions.length) {
    await db
      .update(standupRuns)
      .set({ currentQuestionIndex: nextIdx })
      .where(eq(standupRuns.id, run.id));
    await botPost(channelId, questions[nextIdx].prompt);
  } else {
    await db
      .update(standupRuns)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(standupRuns.id, run.id));
    await botPost(
      channelId,
      "Thanks — that's your standup. Keep up your good work, team! 🎉"
    );
  }
}

/** Cron: mark yesterday's unfinished runs as missed (per standup timezone). */
export async function markMissedRuns(now = new Date()): Promise<number> {
  const active = await db.select().from(standups);
  let missed = 0;
  for (const s of active) {
    const localDate = formatInTimeZone(now, s.timezone, "yyyy-MM-dd");
    const res = await db
      .update(standupRuns)
      .set({ status: "missed" })
      .where(
        and(
          eq(standupRuns.standupId, s.id),
          eq(standupRuns.status, "in_progress"),
          lt(standupRuns.runDate, localDate)
        )
      )
      .returning({ id: standupRuns.id });
    missed += res.length;
  }
  return missed;
}
