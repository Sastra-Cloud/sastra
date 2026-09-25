import { createHash } from "node:crypto";

export const AGREEMENT_PARSER_VERSION = 1;
export const AGREEMENT_INDEX_VERSION = 1;
export const AGREEMENT_EMBEDDING_VERSION = 2;
export const AGREEMENT_CHUNK_TARGET_CHARS = 3_500;
const MAX_OVERLAP_CHARS = 650;

export type AgreementPage = { page: number | null; text: string };

export type AgreementParserKind = "pdf" | "docx" | "text" | "image" | null;

export function agreementParserKind(mimeType: string): AgreementParserKind {
  if (mimeType === "application/pdf") return "pdf";
  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "docx";
  }
  if (mimeType === "text/plain" || mimeType === "text/markdown") return "text";
  if (/^image\/(?:png|jpe?g|webp|gif)$/.test(mimeType)) return "image";
  return null;
}

export type AgreementChunk = {
  id: string;
  chunkIndex: number;
  section: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  content: string;
  searchText: string;
  embeddingText: string;
};

type Block = {
  section: string | null;
  page: number | null;
  text: string;
};

function normalizeLine(value: string) {
  return value.replace(/[\t\f\v ]+/g, " ").trim();
}

export function normalizeAgreementPages(pages: AgreementPage[]): AgreementPage[] {
  return pages
    .map((page, index) => ({
      page: page.page ?? (pages.length > 1 ? index + 1 : null),
      text: page.text
        .replace(/\r\n?/g, "\n")
        .split("\n")
        .map(normalizeLine)
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim(),
    }))
    .filter((page) => page.text.length > 0);
}

export function agreementNormalizedText(pages: AgreementPage[]): string {
  const normalized = normalizeAgreementPages(pages);
  if (normalized.length <= 1) return normalized[0]?.text ?? "";
  return normalized
    .map((page) => `--- Page ${page.page ?? "?"} ---\n${page.text}`)
    .join("\n\n");
}

export function agreementPdfNeedsOcr(pages: AgreementPage[]): boolean {
  const text = agreementNormalizedText(pages);
  if (!text) return true;
  const alphaCount = (text.match(/[\p{L}\p{N}]/gu) ?? []).length;
  return (
    text.length < Math.max(300, pages.length * 100) ||
    alphaCount / text.length < 0.15
  );
}

function isHeading(line: string): boolean {
  if (line.length < 2 || line.length > 150) return false;
  if (/^(article|section|clause|schedule|appendix|exhibit|annex|definitions?)\b[\s\d:.-]*/i.test(line)) {
    return true;
  }
  if (/^\d+(?:\.\d+){0,4}[.)]?\s+[A-Z][^.!?]{1,120}$/.test(line)) return true;
  const letters = line.replace(/[^A-Za-z]/g, "");
  return letters.length >= 4 && line === line.toUpperCase() && !/[.!?]$/.test(line);
}

function blocksFromPages(pages: AgreementPage[]): Block[] {
  const blocks: Block[] = [];
  let currentSection: string | null = null;
  for (const page of normalizeAgreementPages(pages)) {
    const paragraphs = page.text.split(/\n{2,}/);
    for (const paragraph of paragraphs) {
      const lines = paragraph.split("\n").map(normalizeLine).filter(Boolean);
      if (lines.length === 0) continue;
      if (isHeading(lines[0])) {
        currentSection = lines[0];
        if (lines.length === 1) continue;
        lines.shift();
      }
      const text = lines.join("\n").trim();
      if (text) blocks.push({ section: currentSection, page: page.page, text });
    }
  }
  return blocks;
}

function stableChunkId(input: {
  documentId: string;
  contentHash: string;
  index: number;
  content: string;
}) {
  return createHash("sha256")
    .update(
      [
        input.documentId,
        AGREEMENT_INDEX_VERSION,
        input.contentHash,
        input.index,
        input.content,
      ].join("\0")
    )
    .digest("hex");
}

export function buildAgreementChunks(input: {
  documentId: string;
  contentHash: string;
  documentName: string;
  label: "mou" | "license";
  pages: AgreementPage[];
}): AgreementChunk[] {
  const blocks = blocksFromPages(input.pages);
  if (blocks.length === 0) return [];

  const groups: Block[][] = [];
  let current: Block[] = [];
  const flush = () => {
    if (current.length) groups.push(current);
    current = [];
  };

  for (const block of blocks) {
    if (block.text.length > AGREEMENT_CHUNK_TARGET_CHARS) {
      flush();
      for (let offset = 0; offset < block.text.length; offset += AGREEMENT_CHUNK_TARGET_CHARS) {
        groups.push([
          {
            ...block,
            text: block.text.slice(offset, offset + AGREEMENT_CHUNK_TARGET_CHARS).trim(),
          },
        ]);
      }
      continue;
    }
    const candidateLength = [...current, block]
      .map((item) => item.text)
      .join("\n\n").length;
    const sectionChanged =
      current.length > 0 && current[current.length - 1]?.section !== block.section;
    if (
      current.length > 0 &&
      (candidateLength > AGREEMENT_CHUNK_TARGET_CHARS || sectionChanged)
    ) {
      const overlap = current[current.length - 1];
      flush();
      current =
        overlap && overlap.text.length <= MAX_OVERLAP_CHARS && overlap.section === block.section
          ? [overlap, block]
          : [block];
    } else {
      current.push(block);
    }
  }
  flush();

  return groups.map((group, chunkIndex) => {
    const content = group.map((block) => block.text).join("\n\n").trim();
    const pages = group
      .map((block) => block.page)
      .filter((page): page is number => page != null);
    const section = group.find((block) => block.section)?.section ?? null;
    const context = [input.documentName, input.label, section, content]
      .filter(Boolean)
      .join("\n");
    return {
      id: stableChunkId({
        documentId: input.documentId,
        contentHash: input.contentHash,
        index: chunkIndex,
        content,
      }),
      chunkIndex,
      section,
      pageStart: pages.length ? Math.min(...pages) : null,
      pageEnd: pages.length ? Math.max(...pages) : null,
      content,
      searchText: context.replace(/\s+/g, " ").trim(),
      embeddingText: [
        `Document: ${input.documentName}`,
        `Agreement type: ${input.label}`,
        section ? `Section: ${section}` : null,
        `Content: ${content}`,
      ]
        .filter(Boolean)
        .join("\n"),
    };
  });
}

export function estimateAgreementTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
