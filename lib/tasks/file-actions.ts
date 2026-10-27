"use server";

import { requireUser } from "@/lib/auth/guards";
import { listAttachments } from "@/lib/files/queries";
import { assertTaskAccess } from "./access";

/** Task files keep the same visibility boundary as the task itself. */
export async function listTaskAttachments(taskId: string) {
  const { user } = await requireUser();
  await assertTaskAccess(taskId, user);
  return listAttachments("task", taskId);
}
