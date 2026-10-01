// Shared by the migration runner, Next instrumentation, and supported CLI starts.
// Keep this module free of environment loading or connections at import time.
import postgres from "postgres";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

export const MIN_POSTGRES_VERSION_NUM = 180000;
export const POSTGRES_REQUIREMENTS_GUIDE = "https://github.com/Sastra-Cloud/sastra/blob/main/docs/self-hosting/postgresql-upgrade.md";

export function assertSupportedVersion(versionNum) {
  const version = Number(versionNum);
  if (!Number.isInteger(version) || version < MIN_POSTGRES_VERSION_NUM) {
    const detected = Number.isInteger(version) && version > 0
      ? ` Detected PostgreSQL ${Math.floor(version / 10000)}.` : "";
    throw new Error(`Sastra requires PostgreSQL 18 or newer.${detected} Database requirements: ${POSTGRES_REQUIREMENTS_GUIDE}`);
  }
  return version;
}

export async function assertSupportedDatabase(sql) {
  const [row] = await sql`select current_setting('server_version_num')::int as version_num`;
  return assertSupportedVersion(row?.version_num);
}

export async function checkDatabase(url, options = {}) {
  if (!url) throw new Error("DATABASE_URL is not set");
  // Pass through the URL unchanged: sslmode and NODE_EXTRA_CA_CERTS still apply.
  const sql = postgres(url, { ...options, max: 1, prepare: false, connect_timeout: 10 });
  try {
    let version;
    try {
      const [row] = await sql`select current_setting('server_version_num')::int as version_num`;
      version = row?.version_num;
    } catch {
      // Driver errors may contain connection details. Never print the URL.
      throw new Error("Database preflight could not connect. Check database availability and TLS configuration.");
    }
    return assertSupportedVersion(version);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const nextEnv = process.argv.find((arg) => arg.startsWith("--next-env="));
    if (nextEnv) {
      // Resolve through Next so pnpm need not expose its transitive @next/env.
      const require = createRequire(import.meta.url);
      const { loadEnvConfig } = createRequire(require.resolve("next/package.json"))("@next/env");
      loadEnvConfig(process.cwd(), nextEnv.endsWith("development"));
    } else {
      try { process.loadEnvFile(".env"); } catch { /* Containers use ambient env. */ }
    }
    const url = process.argv.includes("--migration")
      ? process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL
      : process.env.DATABASE_URL;
    const version = await checkDatabase(url);
    console.log(`Database preflight passed (PostgreSQL ${Math.floor(version / 10000)}.${version % 10000}).`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
