// Idempotent production bootstrap for non-schema baseline data. This script only
// inserts missing rows; admin customizations are never overwritten on deploy.
import postgres from "postgres";
import templates from "../lib/projects/default-templates.json" with { type: "json" };

try {
  process.loadEnvFile(".env");
} catch {
  // Production provides environment variables directly.
}

// Runs right after migrate.mjs, so it uses the same direct connection when one
// is configured.
const url = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const roles = [
  ["rights", "Rights & Permissions", "#475569", 10, 14],
  ["translation", "Translation Coordinator", "#2563eb", 20, 30],
  ["first_edit", "First Draft Edit Coordinator", "#7c3aed", 30, 14],
  ["proofread", "Proofreader Coordinator", "#0891b2", 40, 10],
  ["final_edit", "Final Draft Coordinator", "#9333ea", 50, 7],
  ["layout", "Layout Coordinator", "#ca8a04", 60, 10],
  ["post_layout_proof", "Post-Layout Proofreading Coordinator", "#0e7490", 70, 5],
  ["marketing", "Marketing Coordinator", "#ea580c", 80, 21],
  ["printing", "Printing Coordinator", "#b45309", 90, 14],
  ["audio", "Audio", "#16a34a", 100, 14],
  ["video", "Video", "#dc2626", 110, 14],
  ["illustration", "Illustration / Cover", "#db2777", 120, 5],
];

const aiModels = [
  ["assistant", "openai/gpt-5-mini", ["anthropic/claude-haiku-4.5"]],
  ["assistant_complex", "openai/gpt-5.4-mini", ["anthropic/claude-sonnet-5"]],
  ["assistant_summary", "openai/gpt-5-mini", ["anthropic/claude-haiku-4.5"]],
  ["assistant_reflection", "openai/gpt-5.4-mini", ["anthropic/claude-sonnet-5"]],
  ["project_update_review", "openai/gpt-5-mini", ["anthropic/claude-haiku-4.5"]],
  ["email_project_signal", "openai/gpt-5-mini", ["anthropic/claude-haiku-4.5"]],
  ["email_task_signal", "openai/gpt-5-mini", ["anthropic/claude-haiku-4.5"]],
  ["email_follow_up_summary", "openai/gpt-5-mini", ["anthropic/claude-haiku-4.5"]],
  ["assistant_eval", "openai/gpt-5.4-mini", ["anthropic/claude-sonnet-5"]],
  ["email_draft", "anthropic/claude-sonnet-5", ["anthropic/claude-sonnet-4.6"]],
  ["planner", "anthropic/claude-sonnet-4.5", []],
  ["doc_import", "anthropic/claude-sonnet-5", []],
  ["standup_insights", "anthropic/claude-haiku-4.5", []],
];

const sql = postgres(url, { max: 1 });
try {
  const initialSuperAdminEmail = process.env.INITIAL_SUPER_ADMIN_EMAIL
    ?.trim()
    .toLowerCase();
  if (initialSuperAdminEmail) {
    await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext('initial-super-admin'))`;
      const [{ count: existingSuperAdmins }] = await tx`
        select count(*)::int as count
        from "user"
        where role = 'super_admin'
          and is_active = true
          and is_bot = false
      `;
      if (existingSuperAdmins > 0) return;

      const promoted = await tx`
        update "user"
        set role = 'super_admin', updated_at = now()
        where lower(email) = ${initialSuperAdminEmail}
          and role = 'admin'
          and is_active = true
          and is_bot = false
        returning id
      `;
      if (promoted.length !== 1) {
        throw new Error(
          "INITIAL_SUPER_ADMIN_EMAIL must identify one active administrator."
        );
      }
      await tx`
        insert into security_events (actor_id, event, method)
        values (${promoted[0].id}, 'initial_super_admin_promoted', 'deployment_bootstrap')
      `;
      console.log("Initial super administrator promoted.");
    });
  }

  for (const [key, label, color, sortOrder, duration] of roles) {
    await sql`
      insert into project_roles (key, label, color, sort_order, default_duration_days, is_active)
      values (${key}, ${label}, ${color}, ${sortOrder}, ${duration}, true)
      on conflict (key) do nothing
    `;
  }
  await sql`
    insert into "user" (id, name, email, email_verified, role, timezone, is_bot, is_active)
    values ('standup-bot', 'Standup Bot', 'standup-bot@sastra.local', true, 'member', 'UTC', true, true)
    on conflict (id) do nothing
  `;
  await sql`
    insert into chat_channels (name, kind)
    select 'general', 'general'
    where not exists (
      select 1
      from chat_channels
      where project_id is null
        and lower(name) = 'general'
        and kind not in ('direct', 'standup')
    )
  `;
  for (const [taskKey, model, fallbacks] of aiModels) {
    await sql`
      insert into ai_task_models (task_key, model, fallback_models)
      values (${taskKey}, ${model}, ${fallbacks})
      on conflict (task_key) do nothing
    `;
  }

  const roleRows = await sql`select id, key from project_roles`;
  const roleByKey = new Map(roleRows.map((row) => [row.key, row.id]));
  for (const template of templates) {
    const existing = await sql`select id from plan_templates where key = ${template.key} limit 1`;
    if (existing.length) continue;
    await sql.begin(async (tx) => {
      const [plan] = await tx`
        insert into plan_templates (key, name, description)
        values (${template.key}, ${template.name}, ${template.description})
        returning id
      `;
      for (let phaseIndex = 0; phaseIndex < template.phases.length; phaseIndex++) {
        const phase = template.phases[phaseIndex];
        const [phaseRow] = await tx`
          insert into phase_templates (plan_template_id, name, order_index, default_duration_days, color)
          values (${plan.id}, ${phase.name}, ${phaseIndex}, ${phase.durationDays ?? null}, ${phase.color ?? null})
          returning id
        `;
        for (let taskIndex = 0; taskIndex < phase.tasks.length; taskIndex++) {
          const task = phase.tasks[taskIndex];
          await tx`
            insert into task_templates (
              phase_template_id, name, description, order_index,
              default_project_role_id, default_offset_days, is_per_unit
            ) values (
              ${phaseRow.id}, ${task.name}, ${task.description ?? null}, ${taskIndex},
              ${task.roleKey ? roleByKey.get(task.roleKey) ?? null : null},
              ${task.offsetDays ?? null}, ${task.perUnit ?? false}
            )
          `;
        }
      }
    });
  }
  console.log("Workspace baseline bootstrap complete.");
} finally {
  await sql.end();
}
