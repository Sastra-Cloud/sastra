"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { assistantLessons } from "@/lib/db/schema";
import { evaluateAssistantLesson } from "./evals";
import { runAssistantReflection } from "./reflection";

const idSchema = z.string().uuid();

export async function runAssistantReflectionNow() {
  await requireRole("admin");
  const result = await runAssistantReflection();
  revalidatePath("/settings/ai");
  return result;
}

export async function runAssistantLessonEval(lessonId: string) {
  await requireRole("admin");
  const result = await evaluateAssistantLesson(idSchema.parse(lessonId));
  revalidatePath("/settings/ai");
  return result;
}

export async function approveAssistantLesson(lessonId: string): Promise<void> {
  const { user } = await requireRole("admin");
  const id = idSchema.parse(lessonId);
  const [candidate] = await db
    .select()
    .from(assistantLessons)
    .where(
      and(eq(assistantLessons.id, id), eq(assistantLessons.status, "candidate"))
    )
    .limit(1);
  if (!candidate) throw new Error("Lesson candidate not found.");
  if (candidate.evalStatus !== "passed") {
    throw new Error("This lesson must pass its regression evaluation first.");
  }
  if (candidate.evidenceCount < 2) throw new Error("Not enough evidence.");

  const [previous] = await db
    .select()
    .from(assistantLessons)
    .where(
      and(
        eq(assistantLessons.key, candidate.key),
        eq(assistantLessons.status, "approved")
      )
    )
    .limit(1);
  const now = new Date();
  await db.transaction(async (tx) => {
    if (previous) {
      await tx
        .update(assistantLessons)
        .set({ status: "retired", updatedAt: now })
        .where(eq(assistantLessons.id, previous.id));
    }
    await tx
      .update(assistantLessons)
      .set({
        status: "approved",
        version: (previous?.version ?? 0) + 1,
        rolloutPercent: 10,
        supersedesId: previous?.id ?? null,
        approvedBy: user.id,
        approvedAt: now,
        updatedAt: now,
      })
      .where(eq(assistantLessons.id, candidate.id));
  });
  revalidatePath("/settings/ai");
}

export async function promoteAssistantLesson(lessonId: string): Promise<void> {
  await requireRole("admin");
  await db
    .update(assistantLessons)
    .set({ rolloutPercent: 100, updatedAt: new Date() })
    .where(
      and(
        eq(assistantLessons.id, idSchema.parse(lessonId)),
        eq(assistantLessons.status, "approved")
      )
    );
  revalidatePath("/settings/ai");
}

export async function rejectAssistantLesson(lessonId: string): Promise<void> {
  await requireRole("admin");
  await db
    .update(assistantLessons)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(
      and(
        eq(assistantLessons.id, idSchema.parse(lessonId)),
        eq(assistantLessons.status, "candidate")
      )
    );
  revalidatePath("/settings/ai");
}

export async function rollbackAssistantLesson(lessonId: string): Promise<void> {
  await requireRole("admin");
  const id = idSchema.parse(lessonId);
  const [lesson] = await db
    .select()
    .from(assistantLessons)
    .where(
      and(eq(assistantLessons.id, id), eq(assistantLessons.status, "approved"))
    )
    .limit(1);
  if (!lesson) throw new Error("Approved lesson not found.");
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(assistantLessons)
      .set({ status: "retired", updatedAt: now })
      .where(eq(assistantLessons.id, lesson.id));
    if (lesson.supersedesId) {
      await tx
        .update(assistantLessons)
        .set({ status: "approved", updatedAt: now })
        .where(eq(assistantLessons.id, lesson.supersedesId));
    }
  });
  revalidatePath("/settings/ai");
}
