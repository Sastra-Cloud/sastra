import "server-only";

import { and, desc, eq, gte, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  emailPreferences,
  emailTaskFeedback,
  emailTaskRules,
  emailTaskSuggestions,
} from "@/lib/db/schema";
import { senderDomain } from "./task-signal-policy";

const WINDOW_DAYS = 30;
const MIN_EVIDENCE = 3;

type Evidence = {
  id: string;
  userId: string;
  signal: "accepted" | "edited" | "dismissed" | "already_done" | "undone";
  finalSnapshot: Record<string, unknown> | null;
  actionKind: string;
  sourceSender: string | null;
  mode: string;
};

type ProposedRule = {
  scope: "user" | "workspace";
  userId: string | null;
  ruleKey: string;
  explanation: string;
  condition: Record<string, unknown>;
  effect: Record<string, unknown>;
  evidenceRefs: string[];
};

function groupBy<T>(rows: T[], key: (row: T) => string | null) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const value = key(row);
    if (!value) continue;
    groups.set(value, [...(groups.get(value) ?? []), row]);
  }
  return groups;
}

async function upsertCandidate(rule: ProposedRule) {
  const candidates = await db
    .select()
    .from(emailTaskRules)
    .where(
      and(
        eq(emailTaskRules.scope, rule.scope),
        rule.userId
          ? eq(emailTaskRules.userId, rule.userId)
          : isNull(emailTaskRules.userId),
        eq(emailTaskRules.ruleKey, rule.ruleKey)
      )
    )
    .limit(1);
  const existing = candidates[0];
  if (existing) {
    if (existing.status !== "candidate") return false;
    const refs = [...new Set([...existing.evidenceRefs, ...rule.evidenceRefs])];
    if (refs.length === existing.evidenceRefs.length) return false;
    await db
      .update(emailTaskRules)
      .set({
        evidenceRefs: refs,
        evidenceCount: refs.length,
        explanation: rule.explanation,
        condition: rule.condition,
        effect: rule.effect,
        updatedAt: new Date(),
      })
      .where(eq(emailTaskRules.id, existing.id));
    return true;
  }
  await db.insert(emailTaskRules).values({
    scope: rule.scope,
    userId: rule.userId,
    ruleKey: rule.ruleKey,
    explanation: rule.explanation,
    condition: rule.condition,
    effect: rule.effect,
    evidenceCount: rule.evidenceRefs.length,
    evidenceRefs: rule.evidenceRefs,
  });
  return true;
}

/**
 * Deterministic, human-gated learning from settled task decisions. It proposes
 * only narrow structured defaults/suppression rules and can never activate one.
 */
export async function reflectEmailTaskFeedback(input?: { windowStart?: Date }) {
  const start =
    input?.windowStart ??
    new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1_000);
  const rows: Evidence[] = await db
    .select({
      id: emailTaskFeedback.id,
      userId: emailTaskFeedback.userId,
      signal: emailTaskFeedback.signal,
      finalSnapshot: emailTaskFeedback.finalSnapshot,
      actionKind: emailTaskSuggestions.actionKind,
      sourceSender: emailTaskSuggestions.sourceSender,
      mode: emailTaskSuggestions.mode,
    })
    .from(emailTaskFeedback)
    .innerJoin(
      emailTaskSuggestions,
      eq(emailTaskSuggestions.id, emailTaskFeedback.suggestionId)
    )
    .where(gte(emailTaskFeedback.createdAt, start))
    .orderBy(desc(emailTaskFeedback.createdAt))
    .limit(500);
  if (rows.length < MIN_EVIDENCE) {
    return { evidenceCount: rows.length, candidateCount: 0 };
  }

  const prefs = await db
    .select({
      userId: emailPreferences.userId,
      enabled: emailPreferences.emailTaskLearningEnabled,
    })
    .from(emailPreferences);
  const disabled = new Set(
    prefs.filter((pref) => !pref.enabled).map((pref) => pref.userId)
  );
  const eligible = rows.filter((row) => !disabled.has(row.userId));
  const proposals: ProposedRule[] = [];

  // Repeated personal dismissals/undos: propose suppressing only this
  // domain+action combination for implicit suggestions.
  const negative = eligible.filter(
    (row) =>
      row.mode === "implicit_review" &&
      (row.signal === "dismissed" || row.signal === "undone")
  );
  for (const [key, evidence] of groupBy(
    negative,
    (row) => {
      const domain = senderDomain(row.sourceSender);
      return domain ? `${row.userId}|${domain}|${row.actionKind}` : null;
    }
  )) {
    if (evidence.length < MIN_EVIDENCE) continue;
    const [userId, domain, actionKind] = key.split("|");
    proposals.push({
      scope: "user",
      userId,
      ruleKey: `suppress:${domain}:${actionKind}`,
      explanation: `You usually dismiss ${actionKind.replaceAll("_", " ")} suggestions from ${domain}. Stop suggesting them?`,
      condition: { senderDomain: domain, actionKind },
      effect: { suppress: true },
      evidenceRefs: evidence.map((row) => row.id),
    });
  }

  // Repeated priority corrections: propose the settled priority as a default.
  const editedWithPriority = eligible.filter(
    (row) =>
      row.signal === "edited" &&
      typeof row.finalSnapshot?.priority === "string" &&
      ["low", "medium", "high", "urgent"].includes(
        String(row.finalSnapshot.priority)
      )
  );
  for (const [key, evidence] of groupBy(editedWithPriority, (row) => {
    const domain = senderDomain(row.sourceSender);
    const priority = String(row.finalSnapshot?.priority ?? "");
    return domain
      ? `${row.userId}|${domain}|${row.actionKind}|${priority}`
      : null;
  })) {
    if (evidence.length < MIN_EVIDENCE) continue;
    const [userId, domain, actionKind, priority] = key.split("|");
    proposals.push({
      scope: "user",
      userId,
      ruleKey: `priority:${domain}:${actionKind}:${priority}`,
      explanation: `You usually set ${actionKind.replaceAll("_", " ")} tasks from ${domain} to ${priority} priority. Use that default?`,
      condition: { senderDomain: domain, actionKind },
      effect: { defaultPriority: priority },
      evidenceRefs: evidence.map((row) => row.id),
    });
  }

  // Shared suppression needs the same pattern from at least two people.
  for (const [key, evidence] of groupBy(negative, (row) => {
    const domain = senderDomain(row.sourceSender);
    return domain ? `${domain}|${row.actionKind}` : null;
  })) {
    if (
      evidence.length < MIN_EVIDENCE ||
      new Set(evidence.map((row) => row.userId)).size < 2
    ) {
      continue;
    }
    const [domain, actionKind] = key.split("|");
    proposals.push({
      scope: "workspace",
      userId: null,
      ruleKey: `suppress:${domain}:${actionKind}`,
      explanation: `Several teammates dismiss ${actionKind.replaceAll("_", " ")} suggestions from ${domain}. Stop suggesting them workspace-wide?`,
      condition: { senderDomain: domain, actionKind },
      effect: { suppress: true },
      evidenceRefs: evidence.map((row) => row.id),
    });
  }

  let candidateCount = 0;
  for (const proposal of proposals.slice(0, 20)) {
    if (await upsertCandidate(proposal)) candidateCount++;
  }
  return { evidenceCount: rows.length, candidateCount };
}
