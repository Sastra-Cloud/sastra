/**
 * Seed baseline data: project roles, the Standup Bot user, and the default plan
 * templates (Book / Article / Article+AV). Uses its own DB connection (lib/db is
 * server-only). Idempotent — safe to re-run.
 */
import { and, eq, ilike, isNull, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  aiTaskModels,
  chatChannels,
  phaseTemplates,
  planTemplates,
  projectRoles,
  taskTemplates,
  user,
} from "../lib/db/schema";
import { DEFAULT_PLAN_TEMPLATES } from "../lib/projects/default-templates";

try {
  process.loadEnvFile(".env");
} catch {
  // rely on ambient env
}

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const db = drizzle(sql, {
  schema: {
    projectRoles,
    user,
    planTemplates,
    phaseTemplates,
    taskTemplates,
    chatChannels,
    aiTaskModels,
  },
});

// The ordered coordinator pipeline (one assigned person per stage per book) plus
// media/cover roles. `defaultDurationDays` seeds the due-date cascade.
const ROLES: {
  key: string;
  label: string;
  color: string;
  sortOrder: number;
  defaultDurationDays: number;
}[] = [
  { key: "rights", label: "Rights & Permissions", color: "#475569", sortOrder: 10, defaultDurationDays: 14 },
  { key: "translation", label: "Translation Coordinator", color: "#2563eb", sortOrder: 20, defaultDurationDays: 30 },
  { key: "first_edit", label: "First Draft Edit Coordinator", color: "#7c3aed", sortOrder: 30, defaultDurationDays: 14 },
  { key: "proofread", label: "Proofreader Coordinator", color: "#0891b2", sortOrder: 40, defaultDurationDays: 10 },
  { key: "final_edit", label: "Final Draft Coordinator", color: "#9333ea", sortOrder: 50, defaultDurationDays: 7 },
  { key: "layout", label: "Layout Coordinator", color: "#ca8a04", sortOrder: 60, defaultDurationDays: 10 },
  { key: "post_layout_proof", label: "Post-Layout Proofreading Coordinator", color: "#0e7490", sortOrder: 70, defaultDurationDays: 5 },
  { key: "marketing", label: "Marketing Coordinator", color: "#ea580c", sortOrder: 80, defaultDurationDays: 21 },
  { key: "printing", label: "Printing Coordinator", color: "#b45309", sortOrder: 90, defaultDurationDays: 14 },
  { key: "audio", label: "Audio", color: "#16a34a", sortOrder: 100, defaultDurationDays: 14 },
  { key: "video", label: "Video", color: "#dc2626", sortOrder: 110, defaultDurationDays: 14 },
  { key: "illustration", label: "Illustration / Cover", color: "#db2777", sortOrder: 120, defaultDurationDays: 5 },
];

async function main() {
  // 1. Project roles — fill missing rows without overwriting Settings edits.
  for (const r of ROLES) {
    await db
      .insert(projectRoles)
      .values({ ...r, isActive: true })
      .onConflictDoNothing({ target: projectRoles.key });
  }
  // Retire legacy roles superseded by the coordinator pipeline (kept so existing
  // members/templates that reference them survive; just hidden from pickers).
  console.log(`✓ project roles (${ROLES.length})`);

  // 2. Standup Bot user
  await db
    .insert(user)
    .values({
      id: "standup-bot",
      name: "Standup Bot",
      email: "standup-bot@sastra.local",
      emailVerified: true,
      isBot: true,
      isActive: true,
    })
    .onConflictDoNothing({ target: user.id });
  console.log("✓ Standup Bot user");

  // 3. Plan templates (idempotent by key)
  const roleRows = await db
    .select({ id: projectRoles.id, key: projectRoles.key })
    .from(projectRoles);
  const roleByKey = new Map(roleRows.map((r) => [r.key, r.id]));

  let created = 0;
  for (const tpl of DEFAULT_PLAN_TEMPLATES) {
    const existing = await db
      .select({ id: planTemplates.id })
      .from(planTemplates)
      .where(eq(planTemplates.key, tpl.key))
      .limit(1);
    if (existing.length > 0) continue;

    const [plan] = await db
      .insert(planTemplates)
      .values({ key: tpl.key, name: tpl.name, description: tpl.description })
      .returning({ id: planTemplates.id });

    for (let pi = 0; pi < tpl.phases.length; pi++) {
      const phase = tpl.phases[pi];
      const [phaseRow] = await db
        .insert(phaseTemplates)
        .values({
          planTemplateId: plan.id,
          name: phase.name,
          orderIndex: pi,
          defaultDurationDays: phase.durationDays,
          color: phase.color,
        })
        .returning({ id: phaseTemplates.id });

      for (let ti = 0; ti < phase.tasks.length; ti++) {
        const t = phase.tasks[ti];
        await db.insert(taskTemplates).values({
          phaseTemplateId: phaseRow.id,
          name: t.name,
          description: t.description,
          orderIndex: ti,
          defaultProjectRoleId: t.roleKey ? roleByKey.get(t.roleKey) : undefined,
          defaultOffsetDays: t.offsetDays,
          isPerUnit: t.perUnit ?? false,
        });
      }
    }
    created++;
  }
  console.log(`✓ plan templates (${created} created, ${DEFAULT_PLAN_TEMPLATES.length - created} existing)`);

  // 4. #general workspace channel
  const existingGeneral = await db
    .select({ id: chatChannels.id })
    .from(chatChannels)
    .where(
      and(
        isNull(chatChannels.projectId),
        ilike(chatChannels.name, "general"),
        ne(chatChannels.kind, "direct"),
        ne(chatChannels.kind, "standup")
      )
    )
    .limit(1);
  if (existingGeneral.length === 0) {
    await db
      .insert(chatChannels)
      .values({ name: "general", kind: "general" });
    console.log("✓ #general channel");
  } else {
    console.log("✓ #general channel (exists)");
  }

  // 5. Default AI model config (editable in Settings ▸ AI). One row per task key;
  //    cheap where volume/latency matters, stronger where output quality matters.
  const AI_MODELS: {
    taskKey: string;
    model: string;
    fallbackModels?: string[];
  }[] = [
    {
      taskKey: "assistant",
      model: "openai/gpt-5-mini",
      fallbackModels: ["anthropic/claude-haiku-4.5"],
    },
    {
      taskKey: "assistant_complex",
      model: "openai/gpt-5.4-mini",
      fallbackModels: ["anthropic/claude-sonnet-5"],
    },
    {
      taskKey: "assistant_summary",
      model: "openai/gpt-5-mini",
      fallbackModels: ["anthropic/claude-haiku-4.5"],
    },
    {
      taskKey: "assistant_reflection",
      model: "openai/gpt-5.4-mini",
      fallbackModels: ["anthropic/claude-sonnet-5"],
    },
    {
      taskKey: "project_update_review",
      model: "openai/gpt-5-mini",
      fallbackModels: ["anthropic/claude-haiku-4.5"],
    },
    {
      taskKey: "email_project_signal",
      model: "openai/gpt-5-mini",
      fallbackModels: ["anthropic/claude-haiku-4.5"],
    },
    {
      taskKey: "email_task_signal",
      model: "openai/gpt-5-mini",
      fallbackModels: ["anthropic/claude-haiku-4.5"],
    },
    {
      taskKey: "email_follow_up_summary",
      model: "openai/gpt-5-mini",
      fallbackModels: ["anthropic/claude-haiku-4.5"],
    },
    {
      taskKey: "email_rights_document",
      model: "openai/gpt-5-mini",
      fallbackModels: ["anthropic/claude-haiku-4.5"],
    },
    {
      taskKey: "assistant_eval",
      model: "openai/gpt-5.4-mini",
      fallbackModels: ["anthropic/claude-sonnet-5"],
    },
    {
      taskKey: "email_draft",
      model: "anthropic/claude-sonnet-5",
      fallbackModels: ["anthropic/claude-sonnet-4.6"],
    },
    { taskKey: "planner", model: "anthropic/claude-sonnet-4.5" },
    { taskKey: "doc_import", model: "anthropic/claude-sonnet-5" },
    { taskKey: "agreement_ocr", model: "openai/gpt-5-mini" },
    {
      taskKey: "agreement_qa",
      model: "anthropic/claude-sonnet-5",
      fallbackModels: ["openai/gpt-5.4"],
    },
    { taskKey: "standup_insights", model: "anthropic/claude-haiku-4.5" },
  ];
  for (const m of AI_MODELS) {
    await db
      .insert(aiTaskModels)
      .values(m)
      .onConflictDoNothing({ target: aiTaskModels.taskKey });
  }
  console.log(`✓ AI model config (${AI_MODELS.length})`);

  await sql.end();
  console.log("Seed complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
