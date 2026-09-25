/**
 * Seed the "Ask Ligonier (Khmer)" podcast project from the signed Limited
 * License Agreement, exercising the podcast schema end to end: kind=podcast,
 * 104 episode units, a rights record (territory/audio/© notice), the three
 * standing obligations, and the two incoming MoU payment tranches. Idempotent —
 * re-running replaces the project. Uses its own DB connection (lib/db is
 * server-only).
 *
 *   pnpm exec tsx scripts/seed-ligonier-podcast.ts
 */
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  licenseObligations,
  mouPayments,
  projects,
  recurringTasks,
  rightsItems,
  tasks,
  units,
  user,
} from "../lib/db/schema";

try {
  process.loadEnvFile(".env");
} catch {
  // rely on ambient env
}

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const db = drizzle(sql);

const SLUG = "ask-ligonier-khmer";
const COPYRIGHT =
  "© 2026. Ligonier Ministries. All worldwide rights reserved.\nUsed with permission under license.";

async function main() {
  const [owner] = await db
    .select({ id: user.id })
    .from(user)
    .orderBy(asc(user.createdAt))
    .limit(1);
  if (!owner) throw new Error("No users in the DB — sign in once first.");

  // Idempotent: drop the prior project (cascades units/rights/obligations/
  // payments/tasks) and its recurring rules.
  const [existing] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.slug, SLUG))
    .limit(1);
  if (existing) {
    await db
      .delete(recurringTasks)
      .where(eq(recurringTasks.projectId, existing.id));
    await db.delete(projects).where(eq(projects.id, existing.id));
    console.log("Removed existing project", existing.id);
  }

  const [project] = await db
    .insert(projects)
    .values({
      slug: SLUG,
      title: "Ask Ligonier (Khmer)",
      targetLanguageTitle: "សួរ Ligonier",
      description:
        "Khmer translation of the Ask Ligonier podcast (104 episodes) under a Limited License Agreement with Ligonier Ministries. Free, non-downloadable digital distribution in Cambodia.",
      kind: "podcast",
      status: "active",
      priority: "high",
      startDate: "2026-07-09",
      dueDate: "2029-12-31",
      createdBy: owner.id,
    })
    .returning({ id: projects.id });
  const projectId = project.id;

  // 104 episodes: 12 published, 6 scheduled, rest draft (so the 52-episode
  // payment gate is visibly NOT met yet).
  const episodeRows = Array.from({ length: 104 }, (_, i) => {
    const n = i + 1;
    const status = n <= 12 ? "published" : n <= 18 ? "scheduled" : "draft";
    return {
      projectId,
      name: `Episode ${n}`,
      orderIndex: i,
      status: status as "published" | "scheduled" | "draft",
      publishedDate: status === "published" ? "2026-08-01" : null,
      scheduledDate: status === "scheduled" ? "2026-09-15" : null,
    };
  });
  await db.insert(units).values(episodeRows);

  // Rights record: the license IS the grant (license_only), signed, Cambodia,
  // audio format, with the verbatim © notice.
  const [rights] = await db
    .insert(rightsItems)
    .values({
      projectId,
      agreementType: "license_only",
      mouStatus: "not_needed",
      licenseStatus: "signed",
      licenseSignedDate: "2026-07-09",
      licenseExpiresDate: "2029-12-31",
      copyrightNotice: COPYRIGHT,
      territory: "Cambodia",
      // Free, non-commercial audio distribution — the license grants audio but
      // NOT the right to sell, so commercial rights are not held.
      commercialGranted: false,
      formatAudio: true,
      rightsStartDate: "2026-07-09",
      overallStatus: "complete",
      createdBy: owner.id,
    })
    .returning({ id: rightsItems.id });

  // Quarterly analytics obligation → a recurring reminder rule, assigned to the
  // project owner so someone is reminded each quarter.
  const [analyticsRule] = await db
    .insert(recurringTasks)
    .values({
      projectId,
      title: "Quarterly analytics report to Ligonier",
      description:
        "Furnish Ligonier with quarterly reports about audience analytics and statistics and testimonies from listeners.",
      assigneeId: owner.id,
      priority: "medium",
      frequency: "quarterly",
      // First report due a quarter FROM signing (2026-07-09), not on it.
      anchorDate: "2026-10-09",
      createdBy: owner.id,
    })
    .returning({ id: recurringTasks.id });

  // Artwork-approval obligation → one milestone gate task, owned by the creator.
  const [artworkTask] = await db
    .insert(tasks)
    .values({
      projectId,
      title: "Get Ligonier approval of any artwork",
      description: "Give Ligonier final approval of any artwork used for the Work.",
      status: "todo",
      priority: "high",
      isMilestone: true,
      assignedTo: owner.id,
      createdBy: owner.id,
    })
    .returning({ id: tasks.id });

  await db.insert(licenseObligations).values([
    {
      projectId,
      rightsItemId: rights.id,
      clauseRef: "2.2",
      kind: "attribution",
      cadence: "per_episode",
      label: "Khmer audio cue every episode",
      text: "Ask Ligonier was originally produced in English by Ligonier Ministries.",
      createdBy: owner.id,
    },
    {
      projectId,
      rightsItemId: rights.id,
      clauseRef: "2.3",
      kind: "artwork_approval",
      cadence: "per_artwork",
      label: "Ligonier artwork approval",
      text: "give Ligonier final approval of any artwork used for the Work",
      assigneeId: owner.id,
      taskId: artworkTask.id,
      createdBy: owner.id,
    },
    {
      projectId,
      rightsItemId: rights.id,
      clauseRef: "2.4",
      kind: "copyright_notice",
      cadence: "on_publish",
      label: "Copyright notice wherever published",
      text: COPYRIGHT,
      createdBy: owner.id,
    },
    {
      projectId,
      rightsItemId: rights.id,
      clauseRef: "5",
      kind: "analytics_report",
      cadence: "quarterly",
      label: "Quarterly analytics report",
      text: "furnish quarterly reports about audience analytics and statistics and testimonies from listeners",
      assigneeId: owner.id,
      recurringTaskId: analyticsRule.id,
      createdBy: owner.id,
    },
  ]);

  // Two incoming tranches: $5,044 on signing, $5,044 after 52 episodes (no
  // earlier than July 2027). Total $10,088.
  await db.insert(mouPayments).values([
    {
      projectId,
      amount: "5044.00",
      currency: "USD",
      trigger: "on_signing",
      dueDate: "2026-07-09",
      notes: "Payment 1 of 2 — on execution",
      createdBy: owner.id,
    },
    {
      projectId,
      amount: "5044.00",
      currency: "USD",
      trigger: "on_52_episodes",
      dueDate: "2027-07-01",
      notes: "Payment 2 of 2 — after 52 episodes published",
      createdBy: owner.id,
    },
  ]);

  console.log(`Seeded podcast project ${projectId} (/projects/${SLUG})`);
  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
