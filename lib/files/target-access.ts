import "server-only";

import { eq } from "drizzle-orm";

import { can, type Capability } from "@/lib/auth/policy";
import { hasProjectCapability } from "@/lib/auth/project-access";
import { canAccessMessage } from "@/lib/chat/access";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { canEditTask } from "@/lib/tasks/access";

/** Upload completion and attachment edits must enforce the target's authority. */
export async function canMutateAttachmentTarget(
  targetType: string,
  targetId: string,
  actor: { id: string; role?: string | null }
): Promise<boolean> {
  if (targetType === "message") return canAccessMessage(targetId, actor.id);
  if (targetType === "task") {
    const [task] = await db.select({ projectId: tasks.projectId, assignedTo: tasks.assignedTo, createdBy: tasks.createdBy })
      .from(tasks).where(eq(tasks.id, targetId)).limit(1);
    return !!task && await canEditTask(actor, task);
  }
  if (targetType === "project") return hasProjectCapability(actor, targetId, "project.edit");

  const capabilities: Record<string, Capability> = {
    rights_item: "rights.edit",
    budget_item: "budget.edit",
    print_quote: "print.manage",
    print_payment: "print.manage",
    license_fee_payment: "rights.edit",
    agreement_group: "project.edit",
    email_message: "correspondence.view",
  };
  const capability = Object.hasOwn(capabilities, targetType) ? capabilities[targetType] : null;
  return capability !== null && can(actor, capability);
}
