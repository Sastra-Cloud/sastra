import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { emailTaskRules } from "@/lib/db/schema";

export type EmailTaskRuleRow = typeof emailTaskRules.$inferSelect;

export async function listEmailTaskRulesForUser(userId: string) {
  return db
    .select()
    .from(emailTaskRules)
    .where(
      and(
        eq(emailTaskRules.scope, "user"),
        eq(emailTaskRules.userId, userId),
        inArray(emailTaskRules.status, ["candidate", "approved"])
      )
    )
    .orderBy(desc(emailTaskRules.createdAt));
}

export async function listWorkspaceEmailTaskRules() {
  return db
    .select()
    .from(emailTaskRules)
    .where(
      and(
        eq(emailTaskRules.scope, "workspace"),
        inArray(emailTaskRules.status, ["candidate", "approved"])
      )
    )
    .orderBy(desc(emailTaskRules.createdAt));
}
