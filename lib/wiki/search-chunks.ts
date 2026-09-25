import type { WikiContentNode, WikiDocument } from "@/lib/db/schema/wiki";

export const WIKI_CHUNKER_VERSION = 1;
export const WIKI_CHUNK_TARGET_CHARS = 3_500;

export type WikiSearchChunkInput = {
  subjectTitle: string;
  subjectSlug: string;
  pageSlug: string;
  pageTitle: string;
  summary: string | null;
  document: WikiDocument;
};

export type WikiSearchChunk = {
  chunkIndex: number;
  section: string | null;
  anchor: string | null;
  content: string;
  searchText: string;
  embeddingText: string;
  containsVideo: boolean;
};

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function nodeText(node: WikiContentNode): string {
  const parts: string[] = [];
  if (node.type === "text" && node.text) parts.push(node.text);
  if (node.type === "wikiImage") {
    if (typeof node.attrs?.alt === "string") parts.push(node.attrs.alt);
    if (typeof node.attrs?.caption === "string") parts.push(node.attrs.caption);
  }
  if (node.type === "wikiVideo") {
    if (typeof node.attrs?.caption === "string") parts.push(node.attrs.caption);
  }
  if (node.type === "externalEmbed" && typeof node.attrs?.url === "string") {
    parts.push(node.attrs.url);
  }
  for (const child of node.content ?? []) parts.push(nodeText(child));
  return clean(parts.filter(Boolean).join(" "));
}

function containsVideo(node: WikiContentNode): boolean {
  return (
    node.type === "wikiVideo" ||
    node.type === "externalEmbed" ||
    (node.content ?? []).some(containsVideo)
  );
}

function headingAnchor(label: string, seen: Map<string, number>): string {
  const base =
    label
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "section";
  const occurrence = seen.get(base) ?? 0;
  seen.set(base, occurrence + 1);
  return occurrence === 0 ? base : `${base}-${occurrence + 1}`;
}

type Section = {
  heading: string | null;
  anchor: string | null;
  blocks: string[];
  containsVideo: boolean;
};

function sectionsFrom(document: WikiDocument): Section[] {
  const seen = new Map<string, number>();
  const sections: Section[] = [
    { heading: null, anchor: null, blocks: [], containsVideo: false },
  ];

  for (const node of document.content ?? []) {
    if (
      node.type === "heading" &&
      (node.attrs?.level === 2 || node.attrs?.level === 3)
    ) {
      const heading = nodeText(node);
      if (heading) {
        sections.push({
          heading,
          anchor: headingAnchor(heading, seen),
          blocks: [],
          containsVideo: false,
        });
        continue;
      }
    }
    const current = sections[sections.length - 1];
    const text = nodeText(node);
    if (text) current.blocks.push(text);
    current.containsVideo ||= containsVideo(node);
  }

  return sections.filter(
    (section, index) =>
      index > 0 || section.blocks.length > 0 || section.containsVideo
  );
}

function splitBlocks(blocks: string[]): string[] {
  if (blocks.length === 0) return [""];
  const chunks: string[] = [];
  let current: string[] = [];

  const flush = () => {
    if (current.length === 0) return;
    chunks.push(clean(current.join("\n\n")));
    current = [];
  };

  for (const block of blocks) {
    if (block.length > WIKI_CHUNK_TARGET_CHARS) {
      flush();
      for (let offset = 0; offset < block.length; offset += WIKI_CHUNK_TARGET_CHARS) {
        chunks.push(clean(block.slice(offset, offset + WIKI_CHUNK_TARGET_CHARS)));
      }
      continue;
    }
    const candidate = [...current, block].join("\n\n");
    if (candidate.length > WIKI_CHUNK_TARGET_CHARS && current.length > 0) {
      const overlap = current[current.length - 1];
      flush();
      current = overlap.length + block.length + 2 <= WIKI_CHUNK_TARGET_CHARS
        ? [overlap, block]
        : [block];
    } else {
      current.push(block);
    }
  }
  flush();
  return chunks.length > 0 ? chunks : [""];
}

export function buildWikiSearchChunks(
  input: WikiSearchChunkInput
): WikiSearchChunk[] {
  const sections = sectionsFrom(input.document);
  if (sections.length === 0) {
    sections.push({
      heading: null,
      anchor: null,
      blocks: [],
      containsVideo: false,
    });
  }

  const chunks: WikiSearchChunk[] = [];
  for (const section of sections) {
    for (const body of splitBlocks(section.blocks)) {
      const content = body || input.summary || input.pageTitle;
      const context = [
        input.subjectTitle,
        input.pageTitle,
        input.summary,
        section.heading,
        content,
      ]
        .filter(Boolean)
        .join("\n");
      chunks.push({
        chunkIndex: chunks.length,
        section: section.heading,
        anchor: section.anchor,
        content,
        searchText: clean(context),
        embeddingText: [
          `Subject: ${input.subjectTitle}`,
          `Page: ${input.pageTitle}`,
          input.summary ? `Summary: ${input.summary}` : null,
          section.heading ? `Section: ${section.heading}` : null,
          `Content: ${content}`,
        ]
          .filter(Boolean)
          .join("\n"),
        containsVideo: section.containsVideo,
      });
    }
  }
  return chunks;
}
