import { describe, expect, it } from "vitest";

import { evaluateReadiness, expectedSchema } from "./readiness";

const journal = {
  entries: [
    { idx: 0, when: 1000, tag: "0000_init" },
    { idx: 1, when: 2000, tag: "0001_more" },
  ],
};

describe("expectedSchema", () => {
  it("returns the last journal entry with the total count", () => {
    expect(expectedSchema(journal)).toEqual({ idx: 1, when: 2000, tag: "0001_more", count: 2 });
    expect(expectedSchema({ entries: [] })).toBeNull();
  });
});

describe("evaluateReadiness", () => {
  const expected = expectedSchema(journal);

  it("is ready when the database answers, the schema is current, and bootstrap ran", () => {
    expect(
      evaluateReadiness({ databaseReachable: true, appliedMigrationWhen: 2000, expected, bootstrapComplete: true })
    ).toEqual({
      ready: true,
      checks: { database: "ok", schema: "ok", bootstrap: "ok" },
      schema: { expected: "0001_more", applied: 2000 },
    });
  });

  it("reports a database that is behind this build", () => {
    const report = evaluateReadiness({
      databaseReachable: true,
      appliedMigrationWhen: 1000,
      expected,
      bootstrapComplete: true,
    });
    expect(report.ready).toBe(false);
    expect(report.checks.schema).toBe("behind");
  });

  it("treats an empty migration table as behind and an unreachable database as unknown", () => {
    expect(
      evaluateReadiness({ databaseReachable: true, appliedMigrationWhen: null, expected, bootstrapComplete: false })
        .checks
    ).toEqual({ database: "ok", schema: "behind", bootstrap: "pending" });
    expect(
      evaluateReadiness({ databaseReachable: false, appliedMigrationWhen: null, expected, bootstrapComplete: false })
        .checks
    ).toEqual({ database: "unreachable", schema: "unknown", bootstrap: "pending" });
  });

  it("accepts a database that is ahead of this build (a newer image was already migrated)", () => {
    expect(
      evaluateReadiness({ databaseReachable: true, appliedMigrationWhen: 3000, expected, bootstrapComplete: true })
        .ready
    ).toBe(true);
  });
});
