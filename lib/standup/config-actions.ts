"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { isValidTimeZone } from "@/lib/timezone";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import {
  standupParticipants,
  standupQuestions,
  standups,
} from "@/lib/db/schema";
import { startStandupNow } from "./engine";
import { generateDueReports } from "./insights";
import { requestScheduledTick } from "@/lib/hosted/tick-request";

const DEFAULT_QUESTIONS = [
  "What did you do yesterday?",
  "What will you do today?",
  "Any impediments or difficulties in your way?",
];

export type StandupState = { error?: string };

export async function createStandup(_prev: StandupState, formData: FormData) {
  const { user } = await requireRole("manager");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Name is required." };
  const timezone = String(formData.get("timezone") ?? "UTC").trim();
  if (!isValidTimeZone(timezone)) return { error: "Choose a valid timezone." };
  const scheduleTime = String(formData.get("scheduleTime") ?? "09:00");
  const days = formData
    .getAll("days")
    .map((d) => Number(d))
    .filter((n) => n >= 0 && n <= 6);

  const [s] = await db
    .insert(standups)
    .values({
      name,
      timezone,
      scheduleTime,
      scheduleDays: days.length ? days : [1, 2, 3, 4, 5],
      createdBy: user.id,
    })
    .returning({ id: standups.id });

  await db.insert(standupQuestions).values(
    DEFAULT_QUESTIONS.map((prompt, i) => ({
      standupId: s.id,
      prompt,
      orderIndex: i,
    }))
  );

  requestScheduledTick(); // the schedule changed
  redirect(`/settings/standups/${s.id}`);
}

const updateSchema = z.object({
  scheduleTime: z.string(),
  timezone: z.string().trim().refine(isValidTimeZone, "Choose a valid timezone."),
  reminderAfterMinutes: z.coerce.number().int().min(0).optional(),
  reportToUserId: z.string().optional(),
  isActive: z.boolean(),
});

export async function updateStandup(id: string, formData: FormData) {
  await requireRole("manager");
  const days = formData
    .getAll("days")
    .map((d) => Number(d))
    .filter((n) => n >= 0 && n <= 6);
  const parsed = updateSchema.safeParse({
    scheduleTime: formData.get("scheduleTime"),
    timezone: formData.get("timezone"),
    reminderAfterMinutes: formData.get("reminderAfterMinutes") || undefined,
    reportToUserId: formData.get("reportToUserId") || undefined,
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check the schedule settings.");
  const d = parsed.data;
  await db
    .update(standups)
    .set({
      scheduleTime: d.scheduleTime,
      timezone: d.timezone,
      scheduleDays: days.length ? days : [1, 2, 3, 4, 5],
      reminderAfterMinutes: d.reminderAfterMinutes ?? null,
      reportToUserId: d.reportToUserId && d.reportToUserId !== "none" ? d.reportToUserId : null,
      isActive: d.isActive,
      updatedAt: new Date(),
    })
    .where(eq(standups.id, id));
  requestScheduledTick(); // the schedule changed
  revalidatePath(`/settings/standups/${id}`);
}

export async function addQuestion(standupId: string, prompt: string) {
  await requireRole("manager");
  if (!prompt.trim()) return;
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${standupQuestions.orderIndex}), -1)::int` })
    .from(standupQuestions)
    .where(eq(standupQuestions.standupId, standupId));
  const [created] = await db
    .insert(standupQuestions)
    .values({ standupId, prompt: prompt.trim(), orderIndex: (max ?? -1) + 1 })
    .returning({ id: standupQuestions.id });
  revalidatePath(`/settings/standups/${standupId}`);
  return { id: created.id };
}

export async function removeQuestion(id: string, standupId: string) {
  await requireRole("manager");
  await db.delete(standupQuestions).where(eq(standupQuestions.id, id));
  revalidatePath(`/settings/standups/${standupId}`);
}

export async function reorderQuestions(standupId: string, orderedIds: string[]) {
  await requireRole("manager");
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx
        .update(standupQuestions)
        .set({ orderIndex: i })
        .where(eq(standupQuestions.id, orderedIds[i]));
    }
  });
  revalidatePath(`/settings/standups/${standupId}`);
}

export async function addParticipant(standupId: string, userId: string) {
  await requireRole("manager");
  if (!userId) return;
  const [created] = await db
    .insert(standupParticipants)
    .values({ standupId, userId })
    .onConflictDoNothing()
    .returning({ id: standupParticipants.id });
  revalidatePath(`/settings/standups/${standupId}`);
  return { id: created?.id };
}

export async function removeParticipant(id: string, standupId: string) {
  await requireRole("manager");
  await db.delete(standupParticipants).where(eq(standupParticipants.id, id));
  revalidatePath(`/settings/standups/${standupId}`);
}

export async function deleteStandup(id: string) {
  await requireRole("manager");
  await db.delete(standups).where(eq(standups.id, id));
  requestScheduledTick(); // the schedule changed
  redirect("/settings/standups");
}

/** Manager: kick off today's standup immediately (the "Do standup now" button). */
export async function startNow(standupId: string) {
  await requireRole("manager");
  await startStandupNow(standupId);
  requestScheduledTick(); // an open run is checked every 15 minutes
  revalidatePath("/standups");
}

/** Manager: force report generation now (useful right after everyone answers). */
export async function generateReportsNow() {
  await requireRole("manager");
  await generateDueReports();
  revalidatePath("/standups");
}
