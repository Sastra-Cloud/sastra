"use server";

import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { logActivity } from "@/lib/activity/log";
import type { ActionResult } from "@/lib/actions/result";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { projectBudgetSettings } from "@/lib/db/schema";
import { findOrCreatePartnerContact } from "@/lib/partners/find-or-create";

import { resolveAgreementFundingPartner } from "./funding-partner";
import { getOrCreateBudgetSettings } from "./queries";
import { revalidateBudget } from "./revalidate";

/**
 * Saves the partner named by the project's signed agreement as the project's
 * funding partner, and adds that partner to the saved directory. It fills an
 * empty partner only; a partner someone already chose is never replaced.
 */
export async function saveAgreementFundingPartner(
  projectId: string
): Promise<ActionResult<{ partnerName: string }>> {
  const { user } = await requireRole("manager");
  const parsed = z.uuid().safeParse(projectId);
  if (!parsed.success) {
    return { ok: false, error: { message: "Project not found. Refresh the page and try again." } };
  }
  const settings = await getOrCreateBudgetSettings(parsed.data);
  if (settings.partnerName?.trim()) {
    return { ok: true, data: { partnerName: settings.partnerName.trim() } };
  }
  const partner = await resolveAgreementFundingPartner(parsed.data);
  if (!partner) {
    return {
      ok: false,
      error: { message: "The signed agreement does not name a partner. Add the partner yourself." },
    };
  }

  const saved = await db.transaction(async (tx) => {
    const contactName = [partner.partnerContactFirstName, partner.partnerContactLastName]
      .filter(Boolean)
      .join(" ");
    const link = await findOrCreatePartnerContact(tx, {
      org: partner.partnerName,
      contactName,
      email: partner.partnerContactEmail,
      phone: partner.partnerContact,
    });
    const rows = await tx
      .update(projectBudgetSettings)
      .set({
        partnerName: partner.partnerName,
        partnerContactFirstName: partner.partnerContactFirstName,
        partnerContactLastName: partner.partnerContactLastName,
        partnerContactEmail: partner.partnerContactEmail,
        partnerContact: partner.partnerContact,
        partnerId: link.partnerId,
        partnerContactId: link.partnerContactId,
        updatedAt: new Date(),
      })
      // Guard against a partner saved by someone else in the meantime.
      .where(
        sql`${eq(projectBudgetSettings.projectId, parsed.data)} and coalesce(trim(${projectBudgetSettings.partnerName}), '') = ''`
      )
      .returning({ projectId: projectBudgetSettings.projectId });
    return rows.length > 0;
  });
  if (!saved) {
    return {
      ok: false,
      error: { message: "This project already has a funding partner. Refresh the page to see it." },
    };
  }

  await logActivity({
    actorId: user.id,
    projectId: parsed.data,
    entityType: "budget",
    action: "settings",
    summary: `Saved ${partner.partnerName} as the funding partner from the signed agreement`,
  });
  await revalidateBudget(parsed.data);
  return { ok: true, data: { partnerName: partner.partnerName } };
}
