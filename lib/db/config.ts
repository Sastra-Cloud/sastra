/**
 * Postgres client options derived from the environment. Pure so the rules can
 * be unit tested; `lib/db/index.ts` applies the result.
 *
 * - `DB_MAX_CONNECTIONS`: pool size (default 10; hosted instances use 3).
 * - `DB_IDLE_TIMEOUT`: seconds before an idle connection closes (default 120),
 *   so a database that scales to zero is not kept awake by an idle pool.
 * - `DB_PREPARE`: set `false` behind a transaction-mode pooler (PgBouncer,
 *   Neon's pooled endpoint). Neon pooled hosts (`-pooler`) are detected.
 */
export type DbClientOptions = {
  max: number;
  idle_timeout: number | undefined;
  connect_timeout: number;
  prepare: boolean;
};

type Env = Record<string, string | undefined>;

function positiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function nonNegativeInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

/** Whether the URL points at a transaction-mode pooler that cannot hold prepared statements. */
export function looksLikePooler(connectionString: string | undefined): boolean {
  if (!connectionString) return false;
  try {
    const host = new URL(connectionString).hostname;
    return host.includes("-pooler.") || host.endsWith("-pooler");
  } catch {
    return false;
  }
}

export function resolveDbClientOptions(
  env: Env,
  overrides: Partial<Pick<DbClientOptions, "max">> = {}
): DbClientOptions {
  const idle = nonNegativeInt(env.DB_IDLE_TIMEOUT, 120);
  const prepareEnv = env.DB_PREPARE?.trim().toLowerCase();
  const prepare =
    prepareEnv === "false" ? false : prepareEnv === "true" ? true : !looksLikePooler(env.DATABASE_URL);
  return {
    max: overrides.max ?? positiveInt(env.DB_MAX_CONNECTIONS, 10),
    // postgres-js treats 0 as "never"; undefined keeps its default (also never).
    idle_timeout: idle === 0 ? undefined : idle,
    connect_timeout: positiveInt(env.DB_CONNECT_TIMEOUT, 10),
    prepare,
  };
}
