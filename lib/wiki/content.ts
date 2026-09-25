import { z } from "zod";

import type { WikiContentNode, WikiDocument } from "@/lib/db/schema/wiki";

export const MAX_WIKI_DOCUMENT_BYTES = 1024 * 1024;
export const MAX_WIKI_NODES = 10_000;
export const MAX_WIKI_DEPTH = 24;

const ALLOWED_NODES = new Set([
  "doc",
  "paragraph",
  "text",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "taskList",
  "taskItem",
  "blockquote",
  "codeBlock",
  "horizontalRule",
  "hardBreak",
  "callout",
  "wikiImage",
  "wikiVideo",
  "externalEmbed",
]);

const ALLOWED_MARKS = new Set(["bold", "italic", "strike", "code", "link"]);
const UUID = z.string().uuid();

export type WikiEmbedProvider = "youtube" | "vimeo" | "loom";

export type CanonicalEmbed = {
  provider: WikiEmbedProvider;
  externalId: string;
  url: string;
};

export const EMPTY_WIKI_DOCUMENT: WikiDocument = {
  type: "doc",
  content: [],
};

export const TUTORIAL_WIKI_DOCUMENT: WikiDocument = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Overview" }],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "Explain what this tutorial helps someone accomplish." }],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Before you begin" }],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "List the access, files, or context someone needs." }],
            },
          ],
        },
      ],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Steps" }],
    },
    {
      type: "orderedList",
      attrs: { start: 1 },
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Describe the first action and its expected result." }],
            },
          ],
        },
      ],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Troubleshooting" }],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "Document common problems and how to recover." }],
    },
  ],
};

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2_000) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function validateAttrs(node: WikiContentNode): string | null {
  const attrs = node.attrs ?? {};
  if (node.type === "heading") {
    if (attrs.level !== 2 && attrs.level !== 3) {
      return "Wiki headings must use level 2 or 3.";
    }
  }
  if (node.type === "callout") {
    if (!["note", "tip", "warning"].includes(String(attrs.kind))) {
      return "That callout style is not supported.";
    }
  }
  if (node.type === "wikiImage" || node.type === "wikiVideo") {
    if (!UUID.safeParse(attrs.mediaId).success) {
      return "Media blocks must reference a valid wiki upload.";
    }
    if (typeof attrs.caption === "string" && attrs.caption.length > 500) {
      return "Media captions must be 500 characters or fewer.";
    }
    if (node.type === "wikiImage") {
      if (typeof attrs.alt !== "string" || attrs.alt.length > 500) {
        return "Images need alt text or an empty alt value when decorative.";
      }
    }
  }
  if (node.type === "externalEmbed") {
    if (!["youtube", "vimeo", "loom"].includes(String(attrs.provider))) {
      return "That embed provider is not allowed.";
    }
    if (typeof attrs.externalId !== "string" || attrs.externalId.length > 200) {
      return "That embed identifier is not valid.";
    }
    if (!safeHttpUrl(attrs.url)) return "That embed URL is not valid.";
  }
  return null;
}

export function validateWikiDocument(input: unknown):
  | { ok: true; document: WikiDocument; text: string; mediaIds: string[] }
  | { ok: false; error: string } {
  let serialized: string;
  try {
    serialized = JSON.stringify(input);
  } catch {
    return { ok: false, error: "Wiki content must be valid JSON." };
  }
  if (serialized.length > MAX_WIKI_DOCUMENT_BYTES) {
    return { ok: false, error: "This page is too large. Split it into smaller pages." };
  }
  if (!input || typeof input !== "object" || (input as { type?: unknown }).type !== "doc") {
    return { ok: false, error: "Wiki content must be a document." };
  }

  const text: string[] = [];
  const mediaIds = new Set<string>();
  let count = 0;
  let error: string | null = null;

  function visit(raw: unknown, depth: number) {
    if (error) return;
    if (depth > MAX_WIKI_DEPTH) {
      error = "This page is nested too deeply.";
      return;
    }
    if (!raw || typeof raw !== "object") {
      error = "This page contains an invalid content block.";
      return;
    }
    const node = raw as WikiContentNode;
    count += 1;
    if (count > MAX_WIKI_NODES) {
      error = "This page has too many content blocks.";
      return;
    }
    if (typeof node.type !== "string" || !ALLOWED_NODES.has(node.type)) {
      error = `The ${node.type || "unknown"} content block is not allowed.`;
      return;
    }
    if (node.attrs !== undefined && (!node.attrs || typeof node.attrs !== "object" || Array.isArray(node.attrs))) {
      error = "A content block contains invalid attributes.";
      return;
    }
    if (node.content !== undefined && !Array.isArray(node.content)) {
      error = "A content block contains invalid children.";
      return;
    }
    if (node.marks !== undefined && !Array.isArray(node.marks)) {
      error = "A text block contains invalid formatting.";
      return;
    }
    if (node.type === "text") {
      if (typeof node.text !== "string") {
        error = "A text block contains invalid content.";
        return;
      }
      text.push(node.text);
    }
    for (const mark of node.marks ?? []) {
      if (!mark || typeof mark !== "object" || !ALLOWED_MARKS.has(mark.type)) {
        error = "This text style is not allowed.";
        return;
      }
      if (mark.attrs !== undefined && (!mark.attrs || typeof mark.attrs !== "object" || Array.isArray(mark.attrs))) {
        error = "A text style contains invalid attributes.";
        return;
      }
      if (mark.type === "link") {
        const href = mark.attrs?.href;
        if (!safeHttpUrl(href) && !(typeof href === "string" && href.startsWith("mailto:"))) {
          error = "Links must use HTTP, HTTPS, or mailto.";
          return;
        }
      }
    }
    const attrError = validateAttrs(node);
    if (attrError) {
      error = attrError;
      return;
    }
    if (node.type === "wikiImage" || node.type === "wikiVideo") {
      mediaIds.add(String(node.attrs?.mediaId));
    }
    if (node.type === "externalEmbed") {
      text.push(String(node.attrs?.url ?? ""));
    }
    for (const child of node.content ?? []) visit(child, depth + 1);
  }

  visit(input, 0);
  if (error) return { ok: false, error };
  return {
    ok: true,
    document: input as WikiDocument,
    text: text.join(" ").replace(/\s+/g, " ").trim(),
    mediaIds: [...mediaIds],
  };
}

export function extractWikiHeadings(document: WikiDocument) {
  const headings: Array<{ id: string; text: string; level: 2 | 3 }> = [];
  const seen = new Map<string, number>();

  for (const node of document.content ?? []) {
    if (node.type !== "heading") continue;
    const level = node.attrs?.level;
    if (level !== 2 && level !== 3) continue;
    const label = (node.content ?? [])
      .filter((child) => child.type === "text")
      .map((child) => child.text ?? "")
      .join("")
      .trim();
    if (!label) continue;
    const base = label
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "section";
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    headings.push({
      id: occurrence === 0 ? base : `${base}-${occurrence + 1}`,
      text: label,
      level,
    });
  }
  return headings;
}

export function canonicalizeWikiEmbed(raw: string): CanonicalEmbed | null {
  const safe = safeHttpUrl(raw);
  if (!safe) return null;
  const url = new URL(safe);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");

  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be") {
    const id = host === "youtu.be"
      ? url.pathname.split("/").filter(Boolean)[0]
      : url.searchParams.get("v") ?? url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1];
    if (!id || !/^[A-Za-z0-9_-]{6,20}$/.test(id)) return null;
    return { provider: "youtube", externalId: id, url: `https://youtu.be/${id}` };
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = url.pathname.match(/(?:video\/)?(\d{6,12})/)?.[1];
    if (!id) return null;
    return { provider: "vimeo", externalId: id, url: `https://vimeo.com/${id}` };
  }

  if (host === "loom.com") {
    const id = url.pathname.match(/^\/(?:share|embed)\/([A-Za-z0-9]+)(?:\/|$)/)?.[1];
    if (!id || id.length > 100) return null;
    return { provider: "loom", externalId: id, url: `https://www.loom.com/share/${id}` };
  }

  return null;
}
