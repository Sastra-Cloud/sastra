/**
 * Duplicate-work matching shared by the import list (server) and the review
 * screen (client). Plain functions only — safe to import from either side.
 */

/** Normalize a title for fuzzy duplicate matching. */
export const norm = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Existing projects that look like the works a grant/MoU funds: same funding
 * partner as the agreement. A grant application often creates several projects
 * (one per budget line-item), then the signed MoU arrives as one umbrella
 * document — this lets the review offer to attach it to those projects instead
 * of creating a duplicate. `matchesTotal` is true when the siblings' budgets sum
 * to the agreement total (a strong confirmation it's the same grant).
 */
export function matchGrantProjects<
  T extends { partnerName: string | null; budgetTotalCents: number },
>(
  partnerOrg: string | null,
  agreementTotalCents: number | null,
  existing: T[]
): { siblings: T[]; totalCents: number; matchesTotal: boolean } | null {
  const partner = norm(partnerOrg ?? "");
  if (!partner) return null;
  const siblings = existing.filter(
    (project) => project.partnerName && norm(project.partnerName) === partner
  );
  if (siblings.length === 0) return null;
  const totalCents = siblings.reduce(
    (sum, project) => sum + (project.budgetTotalCents || 0),
    0
  );
  const matchesTotal =
    agreementTotalCents != null &&
    agreementTotalCents > 0 &&
    Math.abs(totalCents - agreementTotalCents) <= 100; // within $1
  return { siblings, totalCents, matchesTotal };
}

/** Candidate existing projects for an extracted title, best match first. */
export function matchProjects<T extends { title: string }>(
  title: string,
  existing: T[]
): { project: T; exact: boolean }[] {
  const nt = norm(title);
  if (!nt) return [];
  return existing
    .map((project) => {
      const np = norm(project.title);
      const exact = np === nt;
      const hit = exact || np.includes(nt) || nt.includes(np);
      return hit ? { project, exact, score: exact ? 2 : 1 } : null;
    })
    .filter((x): x is { project: T; exact: boolean; score: number } => !!x)
    .sort((a, b) => b.score - a.score)
    .map(({ project, exact }) => ({ project, exact }));
}
