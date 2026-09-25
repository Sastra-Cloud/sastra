/**
 * Readiness rules shared by `/api/ready` and tests. The route gathers the raw
 * facts; these helpers decide what they mean.
 */

export type MigrationJournal = {
  entries: Array<{ idx: number; when: number; tag: string }>;
};

export type ExpectedSchema = { idx: number; when: number; tag: string; count: number };

/** The migration this build expects the database to be at (last journal entry). */
export function expectedSchema(journal: MigrationJournal): ExpectedSchema | null {
  const last = journal.entries.at(-1);
  if (!last) return null;
  return { idx: last.idx, when: last.when, tag: last.tag, count: journal.entries.length };
}

export type ReadinessFacts = {
  databaseReachable: boolean;
  /** `max(created_at)` from `drizzle.__drizzle_migrations`, or null when empty/unreadable. */
  appliedMigrationWhen: number | null;
  expected: ExpectedSchema | null;
  /** The baseline bootstrap has run (standup bot and general channel exist). */
  bootstrapComplete: boolean;
};

export type ReadinessReport = {
  ready: boolean;
  checks: {
    database: "ok" | "unreachable";
    schema: "ok" | "behind" | "unknown";
    bootstrap: "ok" | "pending";
  };
  schema: { expected: string | null; applied: number | null };
};

export function evaluateReadiness(facts: ReadinessFacts): ReadinessReport {
  const database = facts.databaseReachable ? "ok" : "unreachable";
  let schema: ReadinessReport["checks"]["schema"] = "unknown";
  if (facts.expected && facts.appliedMigrationWhen !== null) {
    schema = facts.appliedMigrationWhen >= facts.expected.when ? "ok" : "behind";
  } else if (facts.expected && facts.databaseReachable) {
    schema = "behind";
  }
  const bootstrap = facts.bootstrapComplete ? "ok" : "pending";
  return {
    ready: database === "ok" && schema === "ok" && bootstrap === "ok",
    checks: { database, schema, bootstrap },
    schema: { expected: facts.expected?.tag ?? null, applied: facts.appliedMigrationWhen },
  };
}
