import { readFileSync } from "node:fs";
import path from "node:path";

import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { chatChannels, user } from "@/lib/db/schema";
import {
  evaluateReadiness,
  expectedSchema,
  type MigrationJournal,
} from "@/lib/ops/readiness";
import { runningVersion } from "@/lib/ops/version";

// Readiness: the database answers, its schema matches this build, and the
// baseline bootstrap has run. Unlike /api/health this touches the database, so
// use it for deploy-time checks and the control plane, not for a periodic
// health probe that would keep a scaled-to-zero database awake.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let cachedJournal: MigrationJournal | null = null;

function journal(): MigrationJournal | null {
  if (cachedJournal) return cachedJournal;
  try {
    cachedJournal = JSON.parse(
      readFileSync(path.join(process.cwd(), "drizzle", "meta", "_journal.json"), "utf8")
    ) as MigrationJournal;
    return cachedJournal;
  } catch {
    return null;
  }
}

export async function GET() {
  const expected = journal() ? expectedSchema(journal()!) : null;
  let databaseReachable = false;
  let appliedMigrationWhen: number | null = null;
  let bootstrapComplete = false;

  try {
    const [applied] = await db.execute<{ when: string | number | null }>(
      sql`select max(created_at) as "when" from drizzle.__drizzle_migrations`
    );
    databaseReachable = true;
    appliedMigrationWhen = applied?.when === null || applied?.when === undefined ? null : Number(applied.when);
    const [bot] = await db
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.isBot, true), eq(user.isActive, true)))
      .limit(1);
    const [general] = await db
      .select({ id: chatChannels.id })
      .from(chatChannels)
      .where(eq(chatChannels.kind, "general"))
      .limit(1);
    bootstrapComplete = Boolean(bot && general);
  } catch {
    // Unreachable database or missing migration table: reported below.
  }

  const report = evaluateReadiness({ databaseReachable, appliedMigrationWhen, expected, bootstrapComplete });
  return NextResponse.json(
    { ...report, version: runningVersion() },
    { status: report.ready ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
