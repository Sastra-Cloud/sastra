"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/lib/actions/result";
import { isAdminAssured } from "@/lib/auth/assurance";
import { requireRole } from "@/lib/auth/guards";
import {
  getDependencySecurityStatus,
  recordDependencyAuditRequested,
} from "@/lib/security/dependency-monitor";
import { dispatchDependencySecurityWorkflow } from "@/lib/security/github-workflow";

/**
 * Start the signed GitHub dependency audit. External work is progress-based:
 * this only reports that GitHub accepted the request; the webhook settles it.
 */
export async function runDependencySecurityCheck(): Promise<ActionResult> {
  const { user } = await requireRole("super_admin");
  if (!(await isAdminAssured(user.id))) {
    return {
      ok: false,
      error: { message: "Complete the security check before starting an audit." },
    };
  }

  if ((await getDependencySecurityStatus()).state === "running") {
    return {
      ok: false,
      error: { message: "A dependency security check is already running." },
    };
  }

  const dispatched = await dispatchDependencySecurityWorkflow();
  if (!dispatched.ok) {
    return { ok: false, error: { message: dispatched.message } };
  }

  await recordDependencyAuditRequested(user.id);
  revalidatePath("/settings/security");
  return { ok: true };
}
