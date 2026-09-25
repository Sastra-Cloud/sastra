"use server";

import { revalidatePath } from "next/cache";
import { asc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { dictionaryTerms } from "@/lib/db/schema";

const termSchema = z.string().trim().min(2).max(60);
const aliasesSchema = z
  .array(z.string().trim().min(2).max(60))
  .max(10);

export type DictionaryTerm = {
  id: string;
  term: string;
  aliases: string[];
  createdAt: Date;
};

export async function listDictionaryTerms(): Promise<DictionaryTerm[]> {
  await requireUser();
  return db
    .select({
      id: dictionaryTerms.id,
      term: dictionaryTerms.term,
      aliases: dictionaryTerms.aliases,
      createdAt: dictionaryTerms.createdAt,
    })
    .from(dictionaryTerms)
    .orderBy(asc(dictionaryTerms.term));
}

export async function addDictionaryTerm(
  term: string
): Promise<{ error?: string; ok?: boolean; id?: string }> {
  const { user } = await requireUser();
  const parsed = termSchema.safeParse(term);
  if (!parsed.success) return { error: "Enter a term (2–60 characters)." };
  const clean = parsed.data;

  // Case-insensitive dedupe (no expression index needed for a small table).
  const [dupe] = await db
    .select({ id: dictionaryTerms.id })
    .from(dictionaryTerms)
    .where(sql`lower(${dictionaryTerms.term}) = lower(${clean})`)
    .limit(1);
  if (dupe) return { ok: true, id: dupe.id };

  const [created] = await db
    .insert(dictionaryTerms)
    .values({ term: clean, createdBy: user.id })
    .returning({ id: dictionaryTerms.id });
  revalidatePath("/settings/dictionary");
  return { ok: true, id: created.id };
}

export async function removeDictionaryTerm(id: string): Promise<void> {
  await requireUser();
  await db.delete(dictionaryTerms).where(eq(dictionaryTerms.id, id));
  revalidatePath("/settings/dictionary");
}

export async function updateDictionaryTermAliases(
  id: string,
  aliases: string[]
): Promise<{ error?: string; ok?: boolean }> {
  await requireUser();
  const parsed = aliasesSchema.safeParse(aliases);
  if (!parsed.success) {
    return { error: "Add up to 10 aliases, each 2–60 characters." };
  }

  const [entry] = await db
    .select({ term: dictionaryTerms.term })
    .from(dictionaryTerms)
    .where(eq(dictionaryTerms.id, id))
    .limit(1);
  if (!entry) return { error: "Dictionary term not found." };

  const seen = new Set<string>();
  const clean = parsed.data.filter((alias) => {
    const key = alias.toLocaleLowerCase();
    if (key === entry.term.toLocaleLowerCase() || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const otherRows = await db
    .select({ term: dictionaryTerms.term, aliases: dictionaryTerms.aliases })
    .from(dictionaryTerms)
    .where(ne(dictionaryTerms.id, id));
  const unavailable = new Set(
    otherRows.flatMap((row) => [row.term, ...row.aliases]).map((value) =>
      value.toLocaleLowerCase()
    )
  );
  const collision = clean.find((alias) => unavailable.has(alias.toLocaleLowerCase()));
  if (collision) {
    return { error: `“${collision}” is already used by another dictionary term.` };
  }

  await db
    .update(dictionaryTerms)
    .set({ aliases: clean })
    .where(eq(dictionaryTerms.id, id));
  revalidatePath("/settings/dictionary");
  return { ok: true };
}
