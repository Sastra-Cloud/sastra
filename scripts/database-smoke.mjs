// Run ONLY against a disposable database: this deliberately edits baseline rows.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { assertSupportedDatabase } from "./database-preflight.mjs";

if (process.env.SASTRA_DISPOSABLE_DATABASE !== "true") {
  throw new Error("Set SASTRA_DISPOSABLE_DATABASE=true only for a disposable smoke-test database.");
}
const url = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
function run(script) {
  const result = spawnSync(process.execPath, [script], { env: process.env, stdio: "inherit" });
  assert.equal(result.status, 0, `${script} failed`);
}
const sql = postgres(url, { max: 1, prepare: false });
try {
  const version = await assertSupportedDatabase(sql);
  run("scripts/migrate.mjs");
  run("scripts/bootstrap-workspace.mjs");
  await sql`update project_roles set label = 'Smoke administrator edit', is_active = false where key = 'translation'`;
  await sql`update plan_templates set name = 'Smoke custom template' where key = (select key from plan_templates order by key limit 1)`;
  await sql`update ai_task_models set model = 'smoke/custom-model' where task_key = 'assistant'`;
  const before = await sql`select (select count(*)::int from project_roles) as roles, (select count(*)::int from plan_templates) as templates, (select count(*)::int from drizzle.__drizzle_migrations) as migrations`;
  run("scripts/migrate.mjs");
  run("scripts/bootstrap-workspace.mjs");
  const after = await sql`select (select count(*)::int from project_roles) as roles, (select count(*)::int from plan_templates) as templates, (select count(*)::int from drizzle.__drizzle_migrations) as migrations`;
  assert.deepEqual(after, before);
  const [role] = await sql`select label, is_active from project_roles where key = 'translation'`;
  assert.deepEqual(role, { label: "Smoke administrator edit", is_active: false });
  const [model] = await sql`select model from ai_task_models where task_key = 'assistant'`;
  assert.equal(model.model, "smoke/custom-model");
  assert.equal((await sql`select count(*)::int as n from plan_templates where name = 'Smoke custom template'`)[0].n, 1);
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
  assert.equal(after[0].migrations, journal.entries.length);
  const [extension] = await sql`select extversion from pg_extension where extname = 'vector'`;
  assert.ok(extension?.extversion);
  // Use the same dimensionality and cosine operator as Sastra's Wiki/agreement indexes.
  await sql.begin(async tx => {
    await tx`create temporary table smoke_vectors (id serial primary key, embedding vector(1024)) on commit drop`;
    await tx`create index on smoke_vectors using hnsw (embedding vector_cosine_ops)`;
    const vector = `[${[1, ...Array(1023).fill(0)].join(",")}]`;
    const [inserted] = await tx`insert into smoke_vectors (embedding) values (${vector}::vector) returning id`;
    const [nearest] = await tx`select id, embedding <=> ${vector}::vector as distance from smoke_vectors order by embedding <=> ${vector}::vector limit 1`;
    assert.equal(nearest.id, inserted.id);
    assert.equal(nearest.distance, 0);
    await tx`set local enable_seqscan = off`;
    const plan = await tx`explain select id from smoke_vectors order by embedding <=> ${vector}::vector limit 1`;
    assert.ok(plan.some(row => row["QUERY PLAN"].includes("Index Scan")));
  });
  const indexes = await sql`select count(*)::int as n from pg_indexes where indexname in ('wiki_search_chunks_embedding_hnsw_idx', 'agreement_chunks_embedding_hnsw_idx') and indexdef ilike '%hnsw%'`;
  assert.equal(indexes[0].n, 2);
  if (process.env.DATABASE_URL && process.env.DATABASE_URL !== url) {
    const pooled = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
    try { assert.equal(await assertSupportedDatabase(pooled), version); }
    finally { await pooled.end(); }
  }
  console.log(JSON.stringify({ version, vector: extension.extversion, migrations: after[0].migrations, bootstrapIdempotent: true, vectorSearch: true }));
} finally {
  await sql.end();
}
