// Production role seeder — uses only prod deps (postgres), so it runs in the
// Legacy local helper. Production uses bootstrap-workspace.mjs. This helper only
// fills missing roles so a deploy never overwrites settings customizations.
// Keep in sync with the ROLES array in scripts/seed.ts.
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const ROLES = [
  { key: "rights", label: "Rights & Permissions", color: "#475569", sortOrder: 10, dur: 14 },
  { key: "translation", label: "Translation Coordinator", color: "#2563eb", sortOrder: 20, dur: 30 },
  { key: "first_edit", label: "First Draft Edit Coordinator", color: "#7c3aed", sortOrder: 30, dur: 14 },
  { key: "proofread", label: "Proofreader Coordinator", color: "#0891b2", sortOrder: 40, dur: 10 },
  { key: "final_edit", label: "Final Draft Coordinator", color: "#9333ea", sortOrder: 50, dur: 7 },
  { key: "layout", label: "Layout Coordinator", color: "#ca8a04", sortOrder: 60, dur: 10 },
  { key: "post_layout_proof", label: "Post-Layout Proofreading Coordinator", color: "#0e7490", sortOrder: 70, dur: 5 },
  { key: "marketing", label: "Marketing Coordinator", color: "#ea580c", sortOrder: 80, dur: 21 },
  { key: "printing", label: "Printing Coordinator", color: "#b45309", sortOrder: 90, dur: 14 },
  { key: "audio", label: "Audio", color: "#16a34a", sortOrder: 100, dur: 14 },
  { key: "video", label: "Video", color: "#dc2626", sortOrder: 110, dur: 14 },
  { key: "illustration", label: "Illustration / Cover", color: "#db2777", sortOrder: 120, dur: 5 },
];

const sql = postgres(url, { max: 1 });
try {
  for (const r of ROLES) {
    await sql`
      insert into project_roles (key, label, color, sort_order, default_duration_days, is_active)
      values (${r.key}, ${r.label}, ${r.color}, ${r.sortOrder}, ${r.dur}, true)
      on conflict (key) do nothing
    `;
  }
  console.log(`Roles seeded (${ROLES.length}).`);
} catch (err) {
  console.error("Role seed failed:", err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
