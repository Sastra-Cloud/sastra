import "server-only";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import {
  HELP_ROLES,
  rankHelpDocs,
  type HelpDoc,
  type HelpRole,
  type HelpSearchHit,
} from "./search";

export type { HelpDoc, HelpRole, HelpSearchHit } from "./search";

const HELP_DIR = path.join(process.cwd(), "content", "help");

// Docs are static assets read once per server process. A new deploy is a fresh
// process, so there's no in-process invalidation to worry about.
let docsCache: HelpDoc[] | null = null;
let indexCache: string | null = null;

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** Parse a simple inline list: `[a, b, "c"]` or a bare comma list. */
function parseList(value: string): string[] {
  const trimmed = value.trim();
  const inner =
    trimmed.startsWith("[") && trimmed.endsWith("]")
      ? trimmed.slice(1, -1)
      : trimmed;
  return inner
    .split(",")
    .map((item) => stripQuotes(item))
    .map((item) => item.trim())
    .filter(Boolean);
}

// Minimal frontmatter reader for our own files (no external YAML dependency).
// Handles `key: value` lines with quoted scalars and inline `[a, b]` lists.
function parseFrontmatter(raw: string): {
  data: Record<string, string>;
  body: string;
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!match) return { data: {}, body: raw.trim() };
  const data: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (kv) data[kv[1]] = kv[2];
  }
  return { data, body: match[2].trim() };
}

function loadAll(): HelpDoc[] {
  if (docsCache) return docsCache;
  let files: string[];
  try {
    files = readdirSync(HELP_DIR).filter((file) => file.endsWith(".md"));
  } catch {
    // Directory missing (e.g. content not shipped) — degrade to no docs rather
    // than crash the page or the assistant tool.
    docsCache = [];
    return docsCache;
  }

  const docs: HelpDoc[] = files.map((file) => {
    const slug = file.replace(/\.md$/, "");
    const { data, body } = parseFrontmatter(
      readFileSync(path.join(HELP_DIR, file), "utf8")
    );
    const roles = (data.roles ? parseList(data.roles) : []).filter(
      (role): role is HelpRole => (HELP_ROLES as string[]).includes(role)
    );
    const orderValue = Number(data.order);
    return {
      slug,
      title: data.title ? stripQuotes(data.title) : slug,
      category: data.category ? stripQuotes(data.category) : "General",
      roles: roles.length ? roles : [...HELP_ROLES],
      keywords: data.keywords ? parseList(data.keywords) : [],
      order: Number.isFinite(orderValue) ? orderValue : 999,
      summary: data.summary ? stripQuotes(data.summary) : "",
      body,
    } satisfies HelpDoc;
  });

  docs.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  docsCache = docs;
  return docsCache;
}

/** All help docs, ordered. Used to render the Help page. */
export function getHelpDocs(): HelpDoc[] {
  return loadAll();
}

/** One help doc by slug, or null. */
export function getHelpDoc(slug: string): HelpDoc | null {
  return loadAll().find((doc) => doc.slug === slug) ?? null;
}

function normalizeHeading(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[.:!?]+$/, "");
}

/**
 * Extract the markdown under a `##`/`###` heading (up to the next heading of the
 * same or higher level). Lets on-screen coach cards reuse a slice of a help doc
 * instead of duplicating prose in components. Returns null when not found.
 */
export function getHelpSection(slug: string, heading: string): string | null {
  const doc = getHelpDoc(slug);
  if (!doc) return null;
  const target = normalizeHeading(heading);
  const lines = doc.body.split(/\r?\n/);
  let level = 0;
  const collected: string[] = [];
  for (const line of lines) {
    const match = /^(#{1,6})\s+(.*)$/.exec(line);
    if (level === 0) {
      if (match && normalizeHeading(match[2]) === target) {
        level = match[1].length;
      }
      continue;
    }
    // Inside the section: stop at the next heading of equal-or-higher level.
    if (match && match[1].length <= level) break;
    collected.push(line);
  }
  if (level === 0) return null;
  const text = collected.join("\n").trim();
  return text.length ? text : null;
}

/**
 * Compact "- Title (slug) — summary" list for the assistant system prompt.
 * Titles and summaries only (never bodies) so the standing prompt stays cheap.
 */
export function getHelpTopicsIndex(): string {
  if (indexCache != null) return indexCache;
  indexCache = loadAll()
    .map(
      (doc) => `- ${doc.title} (${doc.slug})${doc.summary ? ` — ${doc.summary}` : ""}`
    )
    .join("\n");
  return indexCache;
}

/** Search help docs for the assistant's `search_help_docs` tool. */
export function searchHelpDocs(query: string, limit = 4): HelpSearchHit[] {
  return rankHelpDocs(loadAll(), query, limit);
}
