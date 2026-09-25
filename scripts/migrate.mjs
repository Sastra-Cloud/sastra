// Production migration runner — uses only prod deps (drizzle-orm + postgres),
// so it works in a pruned image without drizzle-kit. Runs at container start
// (unless MIGRATE_ON_START=false) or as a release step before the new version
// starts. Holds an advisory lock so two starting replicas cannot migrate at once.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Prefer a direct (unpooled) connection: the migrator needs one session for
// its transaction and the advisory lock. Falls back to the app's URL.
const url = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false });
try {
  await sql`select pg_advisory_lock(hashtext('sastra-migrate'))`;
  try {
    await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
    console.log("Migrations applied.");
  } finally {
    await sql`select pg_advisory_unlock(hashtext('sastra-migrate'))`;
  }
} catch (err) {
  console.error("Migration failed:", err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
