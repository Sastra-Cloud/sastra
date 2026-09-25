/**
 * Capacity groups (work paths). Concurrency is set per group — books are their
 * own path; articles, podcasts, and video series share a creative path. Duration
 * stays per project kind. Pure + client-safe.
 */

import { z } from "zod";

import { PROJECT_KINDS, type ProjectKind } from "@/lib/projects/kinds";

export type CapacityGroup = {
  key: string;
  name: string;
  concurrency: number;
  kinds: ProjectKind[];
};

/** Seeded on new workspaces; admins can rename, re-staff, and re-group. */
export const DEFAULT_CAPACITY_GROUPS: CapacityGroup[] = [
  { key: "books", name: "Books", concurrency: 3, kinds: ["book"] },
  { key: "media", name: "Creative media", concurrency: 3, kinds: ["article", "podcast", "video_series", "other"] },
];

export const capacityGroupSchema = z.object({
  key: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(60),
  concurrency: z.number().int().min(1).max(50),
  kinds: z.array(z.enum(PROJECT_KINDS)).max(PROJECT_KINDS.length),
});
export const capacityGroupsSchema = z.array(capacityGroupSchema).min(1).max(12);

/**
 * The group a kind belongs to (first match), falling back to the first group.
 * A project with no type set (`null`) is treated as a **book** — the primary
 * kind — rather than "other", so untyped projects land on the Books path.
 */
export function groupForKind(
  groups: CapacityGroup[],
  kind: string | null | undefined
): CapacityGroup | null {
  if (groups.length === 0) return null;
  const k = (kind ?? "book") as ProjectKind;
  return groups.find((g) => g.kinds.includes(k)) ?? groups[0];
}

/**
 * Ensure every kind maps to exactly one group: dedupe kinds across groups
 * (first wins) and drop empty groups, so scheduling never double-counts or
 * loses a project. Returns a safe, normalized set of groups.
 */
export function normalizeGroups(groups: CapacityGroup[]): CapacityGroup[] {
  const source = groups.map((group) => ({
    ...group,
    // Rename only historical system defaults. Admin-authored path names stay intact.
    name:
      group.key === "media" &&
      ["Articles & podcasts", "Articles, podcasts & video"].includes(group.name)
        ? "Creative media"
        : group.name,
    kinds: [...group.kinds],
  }));
  // `video_series` was introduced after configurable capacity groups. Preserve
  // every admin customization while placing it beside the closest shared-media
  // work: article + podcast first, then either one, then other.
  if (source.length > 0 && !source.some((group) => group.kinds.includes("video_series"))) {
    const mediaGroup =
      source.find(
        (group) => group.kinds.includes("article") && group.kinds.includes("podcast")
      ) ??
      source.find((group) => group.kinds.includes("podcast")) ??
      source.find((group) => group.kinds.includes("article")) ??
      source.find((group) => group.kinds.includes("other")) ??
      source[0];
    mediaGroup.kinds.push("video_series");
  }
  const seen = new Set<ProjectKind>();
  const out: CapacityGroup[] = [];
  for (const g of source) {
    const kinds = g.kinds.filter((k) => !seen.has(k));
    kinds.forEach((k) => seen.add(k));
    if (kinds.length > 0) out.push({ ...g, kinds });
  }
  // Any kind not covered lands in the first group so nothing is orphaned.
  const uncovered = PROJECT_KINDS.filter((k) => !seen.has(k));
  if (uncovered.length && out.length) out[0].kinds.push(...uncovered);
  return out.length ? out : DEFAULT_CAPACITY_GROUPS;
}
