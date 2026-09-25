import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { dictionaryTerms, projects, user, workspaceSettings } from "@/lib/db/schema";
import type { VoiceDictionaryEntry } from "@/lib/dictionary/correct";

// Known org/product terms Whisper wouldn't otherwise spell correctly.
const APP_TERMS = ["Sastra", "MoU"];
const MAX_CHARS = 900; // stay within Whisper's initial_prompt window

/**
 * Build a Whisper `initial_prompt` that biases transcription toward the names
 * that actually occur in this workspace — the product/org, project titles,
 * teammate names, and the learned custom dictionary — so dictation spells them
 * right instead of guessing.
 */
export async function buildVoiceContext(): Promise<{
  initialPrompt: string;
  dictionary: VoiceDictionaryEntry[];
}> {
  const [projectRows, userRows, termRows, workspaceRows] = await Promise.all([
    db.select({ title: projects.title }).from(projects),
    db.select({ name: user.name }).from(user).where(eq(user.isBot, false)),
    db
      .select({ term: dictionaryTerms.term, aliases: dictionaryTerms.aliases })
      .from(dictionaryTerms)
      .orderBy(asc(dictionaryTerms.term)),
    db.select({
      orgName: workspaceSettings.orgName,
      aliases: workspaceSettings.orgAliases,
      sourceLanguage: workspaceSettings.sourceLanguage,
      targetLanguage: workspaceSettings.targetLanguage,
    }).from(workspaceSettings).limit(1),
  ]);

  const terms = new Set<string>();
  // Custom terms first so they survive the length cap.
  for (const d of termRows) if (d.term?.trim()) terms.add(d.term.trim());
  const workspace = workspaceRows[0];
  for (const value of [
    workspace?.orgName,
    ...(workspace?.aliases ?? []),
    workspace?.sourceLanguage,
    workspace?.targetLanguage,
  ]) if (value?.trim()) terms.add(value.trim());
  for (const t of APP_TERMS) terms.add(t);
  for (const p of projectRows) if (p.title?.trim()) terms.add(p.title.trim());
  for (const u of userRows) if (u.name?.trim()) terms.add(u.name.trim());

  const list = [...terms];
  const dictionary = termRows.map((row) => ({
    term: row.term,
    aliases: row.aliases,
  }));
  if (list.length === 0) return { initialPrompt: "", dictionary };

  let out = `Glossary of names and terms that may appear: ${list.join(", ")}.`;
  if (out.length > MAX_CHARS) out = `${out.slice(0, MAX_CHARS - 1)}…`;
  return { initialPrompt: out, dictionary };
}
