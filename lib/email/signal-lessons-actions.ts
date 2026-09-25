"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { emailSignalLessons } from "@/lib/db/schema";
import { runEmailSignalReflection } from "@/lib/email/signal-reflection";

const idSchema = z.string().uuid();

/**
 * Promote a reflection-proposed negative lesson so it is injected into the intake
 * prompt. Admin-only and human-gated: only a `candidate` can be approved, and it
 * is only ever reached through this explicit action.
 */
export async function approveEmailSignalLesson(lessonId: string): Promise<void> {
  const { user } = await requireRole("admin");
  const id = idSchema.parse(lessonId);
  const now = new Date();
  const [updated] = await db
    .update(emailSignalLessons)
    .set({
      status: "approved",
      approvedBy: user.id,
      approvedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(emailSignalLessons.id, id),
        eq(emailSignalLessons.status, "candidate")
      )
    )
    .returning({ id: emailSignalLessons.id });
  if (!updated) throw new Error("Lesson candidate not found.");
  revalidatePath("/settings/ai");
}

/** Reject a candidate negative lesson so it is never injected. */
export async function rejectEmailSignalLesson(lessonId: string): Promise<void> {
  await requireRole("admin");
  await db
    .update(emailSignalLessons)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(
      and(
        eq(emailSignalLessons.id, idSchema.parse(lessonId)),
        eq(emailSignalLessons.status, "candidate")
      )
    );
  revalidatePath("/settings/ai");
}

/** Turn an active (approved) negative lesson off; it stops being injected. */
export async function retireEmailSignalLesson(lessonId: string): Promise<void> {
  await requireRole("admin");
  await db
    .update(emailSignalLessons)
    .set({ status: "retired", updatedAt: new Date() })
    .where(
      and(
        eq(emailSignalLessons.id, idSchema.parse(lessonId)),
        eq(emailSignalLessons.status, "approved")
      )
    );
  revalidatePath("/settings/ai");
}

/** Run the reflection pass on demand from the admin learning card. */
export async function runEmailSignalReflectionNow(): Promise<{
  evidenceCount: number;
  candidateCount: number;
}> {
  await requireRole("admin");
  const result = await runEmailSignalReflection();
  revalidatePath("/settings/ai");
  return result;
}
