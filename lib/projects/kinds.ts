export const PROJECT_KINDS = [
  "book",
  "article",
  "podcast",
  "video_series",
  "other",
] as const;

export type ProjectKind = (typeof PROJECT_KINDS)[number];

export const VIDEO_PRODUCTION_MODES = ["original", "translation"] as const;

export type VideoProductionMode = (typeof VIDEO_PRODUCTION_MODES)[number];

export const VIDEO_PRODUCTION_MODE_LABELS: Record<VideoProductionMode, string> = {
  original: "Original",
  translation: "Translation",
};

export function normalizeVideoProductionMode(
  kind: string | null | undefined,
  mode: string | null | undefined
): VideoProductionMode | null {
  if (kind !== "video_series") return null;
  return mode === "translation" ? "translation" : "original";
}

export const PROJECT_KIND_LABELS: Record<ProjectKind, string> = {
  book: "Book",
  article: "Article collection",
  podcast: "Podcast series",
  video_series: "Video series",
  other: "Other",
};

const UNIT_TERMS: Record<ProjectKind, { singular: string; plural: string }> = {
  book: { singular: "chapter", plural: "chapters" },
  article: { singular: "article", plural: "articles" },
  podcast: { singular: "episode", plural: "episodes" },
  video_series: { singular: "video", plural: "videos" },
  other: { singular: "unit", plural: "units" },
};

export function projectUnitTerms(kind: ProjectKind | null | undefined) {
  return kind ? UNIT_TERMS[kind] : UNIT_TERMS.other;
}

/**
 * Kinds whose units are episodes driven through the podcast production stages.
 * `podcast` (audio-first) and `video_series` (video-first) share the whole
 * episode engine — materialization, stages, scheduling, the Episodes surface —
 * so gate episode behavior on this, not on `kind === "podcast"`.
 */
export const EPISODIC_KINDS = ["podcast", "video_series"] as const;

export function isEpisodicKind(kind: string | null | undefined): boolean {
  return kind === "podcast" || kind === "video_series";
}
