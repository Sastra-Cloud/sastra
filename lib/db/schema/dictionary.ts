import {
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { user } from "./auth";

/**
 * Team-wide custom vocabulary (proper nouns, product terms) that biases voice
 * transcription — fed to Whisper as an initial_prompt so words like the organization's name
 * come back spelled right instead of guessed.
 */
export const dictionaryTerms = pgTable(
  "dictionary_terms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    term: text("term").notNull(),
    aliases: text("aliases")
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("dictionary_terms_term_uq").on(t.term)]
);
