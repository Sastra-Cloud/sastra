"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/lib/actions/result";
import { isAdminAssured } from "@/lib/auth/assurance";
import { requireRole } from "@/lib/auth/guards";
import {
  getDependencySecurityStatus,
  recordDependencyAuditRequested,
  syncDependencyAuditFromFeed,
} from "@/lib/security/dependency-monitor";
import {
  dependencySecurityWorkflowConfigured,
  dispatchDependencySecurityWorkflow,
} from "@/lib/security/github-workflow";
import { securityStatusFeedConfigured } from "@/lib/security/status-feed";

/**
 * Refresh the dependency audit. With a GitHub workflow token this starts the
 * signed audit (progress-based: GitHub accepts the request, the webhook
 * settles it). Otherwise it fetches the published result for this version.
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

  if (!dependencySecurityWorkflowConfigured()) {
    if (!securityStatusFeedConfigured()) {
      return { ok: false, error: { message: "Security checks are switched off for this installation." } };
    }
    const synced = await syncDependencyAuditFromFeed();
    if (!synced.synced) {
      return {
        ok: false,
        error: {
          message:
            synced.reason === "no-entry"
              ? "No published check result for this version yet. Try again after the daily audit."
              : "Couldn't reach the published check results. Check your internet and try again.",
        },
      };
    }
    revalidatePath("/settings/security");
    return { ok: true };
  }

  const dispatched = await dispatchDependencySecurityWorkflow();
  if (!dispatched.ok) {
    return { ok: false, error: { message: dispatched.message } };
  }

  await recordDependencyAuditRequested(user.id);
  revalidatePath("/settings/security");
  return { ok: true };
}
