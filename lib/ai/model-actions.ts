"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { aiTaskModels } from "@/lib/db/schema";

export async function updateTaskModel(
  taskKey: string,
  model: string,
  fallbackCsv: string,
  temperature: number | null
) {
  const { user } = await requireRole("admin");
  const cleanModel = model.trim();
  if (!cleanModel) return;
  const fallbackModels = fallbackCsv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  await db
    .insert(aiTaskModels)
    .values({
      taskKey,
      model: cleanModel,
      fallbackModels: fallbackModels.length ? fallbackModels : null,
      temperature,
      updatedBy: user.id,
    })
    .onConflictDoUpdate({
      target: aiTaskModels.taskKey,
      set: {
        model: cleanModel,
        fallbackModels: fallbackModels.length ? fallbackModels : null,
        temperature,
        updatedBy: user.id,
        updatedAt: new Date(),
      },
    });
  revalidatePath("/settings/ai");
}
