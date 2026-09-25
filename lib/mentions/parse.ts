/**
 * Shared @mention parsing. Used on the server to decide who to notify and on
 * the client to highlight mentions when rendering stored text, so it must stay
 * free of DB / `server-only` imports.
 *
 * Mentions are stored inline in the plain text people type (no special markup):
 * a mention is an `@` — at the start of the string or after whitespace/
 * punctuation — immediately followed by one of a roster member's handles
 * (their full display name, first name, spaceless name, or email local-part).
 * Matching against the known roster is what lets multi-word names like
 * "@Nathan Wells" resolve unambiguously; the longest handle wins so a full name
 * is always preferred over a bare first name.
 */

export type MentionUser = {
  id: string;
  name: string;
  email?: string | null;
};

export type MentionSegment =
  | { type: "text"; text: string }
  | { type: "mention"; text: string; user: MentionUser };

// Characters that may border a mention. Anything else is treated as part of a
// name, so "email@host" (no leading boundary) is never read as a mention and a
// trailing letter won't let "@Al" swallow into "@Alex".
const BOUNDARY = /[\s.,;:!?()[\]{}<>"'`~/\\|@#]/;

function isBoundary(ch: string | undefined): boolean {
  return ch === undefined || BOUNDARY.test(ch);
}

/** The distinct handles a person can be addressed by. */
export function handlesFor(u: MentionUser): string[] {
  const name = u.name.trim();
  const first = name.split(/\s+/)[0] ?? "";
  const collapsed = name.replace(/\s+/g, "");
  const local = (u.email ?? "").split("@")[0]?.trim() ?? "";
  return [...new Set([name, collapsed, first, local].filter((h) => h.length > 0))];
}

type Candidate = { lower: string; length: number; user: MentionUser };

function buildCandidates(members: MentionUser[]): Candidate[] {
  const candidates: Candidate[] = [];
  for (const user of members) {
    for (const handle of handlesFor(user)) {
      candidates.push({ lower: handle.toLowerCase(), length: handle.length, user });
    }
  }
  // Longest handle first so "@Nathan Wells" beats the first-name handle "Nathan".
  candidates.sort((a, b) => b.length - a.length);
  return candidates;
}

/**
 * Split `text` into plain-text and mention segments against the given roster.
 * Text with no mentions returns a single text segment (or none when empty).
 */
export function tokenizeMentions(
  text: string,
  members: MentionUser[]
): MentionSegment[] {
  if (!text) return [];
  const candidates = buildCandidates(members);
  if (candidates.length === 0) return [{ type: "text", text }];

  const lower = text.toLowerCase();
  const segments: MentionSegment[] = [];
  let buffer = "";
  let i = 0;

  const flush = () => {
    if (buffer) {
      segments.push({ type: "text", text: buffer });
      buffer = "";
    }
  };

  while (i < text.length) {
    if (text[i] === "@" && isBoundary(text[i - 1])) {
      const start = i + 1;
      const matched = candidates.find(
        (c) =>
          lower.startsWith(c.lower, start) && isBoundary(text[start + c.length])
      );
      if (matched) {
        flush();
        segments.push({
          type: "mention",
          text: text.slice(i, start + matched.length),
          user: matched.user,
        });
        i = start + matched.length;
        continue;
      }
    }
    buffer += text[i];
    i += 1;
  }
  flush();
  return segments;
}

/** The distinct roster user ids mentioned in `text`. */
export function findMentionedIds(text: string, members: MentionUser[]): string[] {
  if (!text.includes("@")) return [];
  const ids = new Set<string>();
  for (const segment of tokenizeMentions(text, members)) {
    if (segment.type === "mention") ids.add(segment.user.id);
  }
  return [...ids];
}

/** Whether `text` mentions anyone in the roster. */
export function hasMention(text: string, members: MentionUser[]): boolean {
  return findMentionedIds(text, members).length > 0;
}
