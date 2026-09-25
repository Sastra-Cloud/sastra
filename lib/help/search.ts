// Pure, dependency-free help-doc types and search ranking. No `fs` and no
// `server-only` here so the scorer can be unit-tested with fixture docs.

export type HelpRole = "member" | "manager" | "admin";

export const HELP_ROLES: HelpRole[] = ["member", "manager", "admin"];

export type HelpDoc = {
  /** Filename without `.md`; also the anchor id on the Help page. */
  slug: string;
  title: string;
  category: string;
  /** Which roles the topic is relevant to (informational, not access control). */
  roles: HelpRole[];
  keywords: string[];
  /** Sort order across all docs; lower comes first. */
  order: number;
  /** One-line description used in the assistant topics index. */
  summary: string;
  /** Raw markdown body with frontmatter stripped. */
  body: string;
};

export type HelpSearchHit = {
  /** Help page anchor for the source topic. */
  slug: string;
  /** "Topic title — Section heading" when a specific section matched. */
  title: string;
  category: string;
  /** Bounded plain excerpt of the matching section. */
  excerpt: string;
};

export type HelpSection = { heading: string; text: string };

/** Split a doc body into H2 sections so excerpts are section-scoped. */
export function helpDocSections(doc: HelpDoc): HelpSection[] {
  const parts = doc.body.split(/\n(?=##\s)/);
  const out: HelpSection[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const match = /^##\s+(.+)$/m.exec(trimmed);
    const heading = match ? match[1].trim() : doc.title;
    const text = trimmed.replace(/^##\s+.+$/m, "").trim();
    out.push({ heading, text: text || trimmed });
  }
  return out.length ? out : [{ heading: doc.title, text: doc.body }];
}

const EXCERPT_LIMIT = 700;

/**
 * Keyword/substring scoring over title (×4), keywords (×3), summary (×2), and
 * section body (×1). No embeddings — the content is small and stable. Returns
 * the top `limit` sections, most relevant first, deduped by topic+section.
 */
export function rankHelpDocs(
  docs: HelpDoc[],
  query: string,
  limit = 4
): HelpSearchHit[] {
  const terms = Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((term) => term.length > 2)
    )
  );
  if (terms.length === 0) return [];

  const scored: { hit: HelpSearchHit; score: number }[] = [];
  for (const doc of docs) {
    const titleL = doc.title.toLowerCase();
    const keywordsL = doc.keywords.join(" ").toLowerCase();
    const summaryL = doc.summary.toLowerCase();
    for (const section of helpDocSections(doc)) {
      // The intro/fallback section reuses the doc title as its heading; don't
      // let that double-count against real, more specific section headings.
      const isIntro = section.heading === doc.title;
      const headingL = section.heading.toLowerCase();
      const textL = section.text.toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (titleL.includes(term)) score += 4;
        if (keywordsL.includes(term)) score += 3;
        if (!isIntro && headingL.includes(term)) score += 3;
        if (summaryL.includes(term)) score += 2;
        if (textL.includes(term)) score += 1;
      }
      if (score > 0) {
        scored.push({
          score,
          hit: {
            slug: doc.slug,
            title:
              section.heading === doc.title
                ? doc.title
                : `${doc.title} — ${section.heading}`,
            category: doc.category,
            excerpt: section.text.slice(0, EXCERPT_LIMIT),
          },
        });
      }
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const hits: HelpSearchHit[] = [];
  for (const entry of scored) {
    const key = `${entry.hit.slug}::${entry.hit.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push(entry.hit);
    if (hits.length >= limit) break;
  }
  return hits;
}
