import "server-only";

import { and, eq, isNotNull } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  licenseRenewalReminders,
  projects,
  rightsHolders,
  rightsItems,
} from "@/lib/db/schema";
import { insertTaskRow } from "@/lib/tasks/create";

const todayIso = () => new Date().toISOString().slice(0, 10);

function minusDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - days);
  return dt.toISOString().slice(0, 10);
}

/**
 * Create a one-shot renewal-reminder task ahead of each NON-auto-renewing
 * license's expiry. Auto-renewing licenses are skipped (nothing to do — the UI
 * just shows "Auto-renews on <date>"). Idempotent: deduped on
 * (projectId, period=expiry date). Run daily by cron; best-effort.
 */
export async function ensureLicenseRenewalReminders(): Promise<number> {
  const rows = await db
    .select({
      projectId: rightsItems.projectId,
      expires: rightsItems.licenseExpiresDate,
      leadDays: rightsItems.licenseRenewalLeadDays,
      noticeDays: rightsItems.licenseRenewalNoticeDays,
      assignee: rightsItems.licenseRenewalAssignedTo,
      title: projects.title,
      holderName: rightsHolders.name,
    })
    .from(rightsItems)
    .innerJoin(projects, eq(projects.id, rightsItems.projectId))
    .leftJoin(rightsHolders, eq(rightsHolders.id, rightsItems.licenseHolderId))
    .where(
      and(
        isNotNull(rightsItems.licenseExpiresDate),
        eq(rightsItems.licenseAutoRenews, false)
      )
    );

  const today = todayIso();
  let created = 0;
  for (const r of rows) {
    try {
      if (!r.expires || !r.assignee) continue;
      const threshold = minusDays(r.expires, r.leadDays ?? 30);
      if (today < threshold) continue; // not yet in the reminder window

      const [rem] = await db
        .insert(licenseRenewalReminders)
        .values({ projectId: r.projectId, period: r.expires })
        .onConflictDoNothing({
          target: [licenseRenewalReminders.projectId, licenseRenewalReminders.period],
        })
        .returning({ id: licenseRenewalReminders.id });
      if (!rem) continue;

      const description = [
        `The license for ${r.title} expires ${r.expires} and does not auto-renew.`,
        r.holderName ? `Licensor: ${r.holderName}.` : null,
        r.noticeDays ? `Notice/renewal window: ${r.noticeDays} days.` : null,
        "Renew or renegotiate before it lapses.",
      ]
        .filter(Boolean)
        .join("\n");

      const taskId = await insertTaskRow(
        {
          projectId: r.projectId,
          title: `Renew license for ${r.title} (expires ${r.expires})`,
          description,
          assignedTo: r.assignee,
          priority: "high",
          dueDate: r.expires,
        },
        { actorId: null, revalidate: false }
      );
      await db
        .update(licenseRenewalReminders)
        .set({ taskId })
        .where(eq(licenseRenewalReminders.id, rem.id));
      created += 1;
    } catch {
      // skip this row
    }
  }
  return created;
}
