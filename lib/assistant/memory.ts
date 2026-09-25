import "server-only";

import { and, asc, eq, gt, isNull, or } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  assistantMemoryFacts,
  assistantSettings,
} from "@/lib/db/schema";
import type { AssistantMemoryCategory } from "./types";

export const MEMORY_FACT_MAX_CHARS = 500;

export type MemoryFact = {
  id: string;
  category: AssistantMemoryCategory;
  content: string;
  source: string;
  status: string;
  confidence: number;
  expiresAt: string | null;
  createdAt: string;
};

function explicitMemoryRequest(text: string): boolean {
  return /\b(remember|keep (?:this|that) in mind|don'?t forget|from now on)\b/i.test(text);
}

function instructionLike(content: string): boolean {
  return /\b(ignore (?:all|any|the|previous)|system prompt|developer message|hidden instructions|bypass|jailbreak|call the \w+ tool|override permissions?)\b/i.test(
    content
  );
}

async function memoryIsEnabled(userId: string): Promise<boolean> {
  const [settings] = await db
    .select({ enabled: assistantSettings.memoryEnabled })
    .from(assistantSettings)
    .where(eq(assistantSettings.userId, userId))
    .limit(1);
  return settings?.enabled ?? true;
}

export async function loadMemory(userId: string): Promise<MemoryFact[]> {
  if (!(await memoryIsEnabled(userId))) return [];
  const now = new Date();
  const rows = await db
    .select()
    .from(assistantMemoryFacts)
    .where(
      and(
        eq(assistantMemoryFacts.userId, userId),
        eq(assistantMemoryFacts.status, "active"),
        or(
          isNull(assistantMemoryFacts.expiresAt),
          gt(assistantMemoryFacts.expiresAt, now)
        )
      )
    )
    .orderBy(asc(assistantMemoryFacts.createdAt));
  return rows.map((row) => ({
    id: row.id,
    category: row.category,
    content: row.content,
    source: row.source,
    status: row.status,
    confidence: row.confidence,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function listMemoryFacts(userId: string): Promise<MemoryFact[]> {
  const rows = await db
    .select()
    .from(assistantMemoryFacts)
    .where(eq(assistantMemoryFacts.userId, userId))
    .orderBy(asc(assistantMemoryFacts.createdAt));
  return rows.map((row) => ({
    id: row.id,
    category: row.category,
    content: row.content,
    source: row.source,
    status: row.status,
    confidence: row.confidence,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function getMemoryState(userId: string): Promise<{
  enabled: boolean;
  facts: MemoryFact[];
}> {
  const [enabled, facts] = await Promise.all([
    memoryIsEnabled(userId),
    listMemoryFacts(userId),
  ]);
  return { enabled, facts };
}

/**
 * Save a model-extracted fact only when it is grounded in the current user
 * message. Explicit “remember…” requests become active; everything else stays a
 * candidate until the user reviews it. Tool output is never accepted as source.
 */
export async function appendMemory(
  userId: string,
  note: string,
  input: {
    category: AssistantMemoryCategory;
    sourceMessageId?: string;
    sourceUserText: string;
  }
): Promise<string> {
  if (!(await memoryIsEnabled(userId))) return "Memory is disabled for this account.";
  const clean = note.trim().replace(/\s+/g, " ").slice(0, MEMORY_FACT_MAX_CHARS);
  if (!clean) return "Nothing to remember.";
  if (instructionLike(clean)) return "That cannot be stored as a user fact.";

  const existing = await db
    .select({ id: assistantMemoryFacts.id, content: assistantMemoryFacts.content })
    .from(assistantMemoryFacts)
    .where(eq(assistantMemoryFacts.userId, userId));
  const duplicate = existing.find(
    (row) => row.content.trim().toLocaleLowerCase() === clean.toLocaleLowerCase()
  );
  if (duplicate) return "That fact is already in memory.";

  const active = explicitMemoryRequest(input.sourceUserText);
  await db.insert(assistantMemoryFacts).values({
    userId,
    category: input.category,
    content: clean,
    source: active ? "explicit_user" : "user_message_candidate",
    sourceMessageId: input.sourceMessageId,
    status: active ? "active" : "candidate",
    confidence: active ? 1 : 0.7,
  });
  return active
    ? "Saved as a user-approved memory fact."
    : "Saved as a memory candidate for the user to review.";
}

export async function setMemoryFactStatus(
  userId: string,
  factId: string,
  status: "active" | "rejected" | "archived"
): Promise<void> {
  await db
    .update(assistantMemoryFacts)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(assistantMemoryFacts.id, factId),
        eq(assistantMemoryFacts.userId, userId)
      )
    );
}

export async function updateMemoryFact(
  userId: string,
  factId: string,
  content: string,
  category: AssistantMemoryCategory
): Promise<void> {
  const clean = content.trim().replace(/\s+/g, " ").slice(0, MEMORY_FACT_MAX_CHARS);
  if (!clean || instructionLike(clean)) throw new Error("Invalid memory fact.");
  await db
    .update(assistantMemoryFacts)
    .set({ content: clean, category, source: "human_edit", updatedAt: new Date() })
    .where(
      and(
        eq(assistantMemoryFacts.id, factId),
        eq(assistantMemoryFacts.userId, userId)
      )
    );
}

export async function clearMemoryFacts(userId: string): Promise<void> {
  await db
    .delete(assistantMemoryFacts)
    .where(eq(assistantMemoryFacts.userId, userId));
}

/** Render facts as clearly delimited data—not instructions. */
export function formatMemoryForPrompt(facts: MemoryFact[]): string {
  if (facts.length === 0) return "(no active user memory facts)";
  return JSON.stringify(
    facts.map((fact) => ({
      id: fact.id,
      category: fact.category,
      fact: fact.content,
    }))
  );
}
