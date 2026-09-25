import "server-only";

import { asc } from "drizzle-orm";

import { db } from "@/lib/db";
import { aiTaskModels } from "@/lib/db/schema";
import { TASK_META } from "@/lib/ai/model-catalog";

export async function listAiTaskModels() {
  const rows = await db
    .select()
    .from(aiTaskModels)
    .orderBy(asc(aiTaskModels.taskKey));
  const configured = new Set(rows.map((row) => row.taskKey));
  const defaults = Object.entries(TASK_META)
    .filter(([taskKey]) => !configured.has(taskKey))
    .map(([taskKey, meta]) => ({
      id: `default:${taskKey}`,
      taskKey,
      model: meta.recommended,
      fallbackModels: null,
      temperature: null,
      updatedBy: null,
      updatedAt: new Date(0),
    }));
  return [...rows, ...defaults];
}
