/**
 * Conservative publisher / rights-holder identity matching.
 *
 * Parenthetical text is treated as an alias only when it is genuinely the
 * acronym of the preceding name ("Union Publishing (UP)"). Region or imprint
 * qualifiers such as "Publisher (UK)" remain part of the identity.
 */

const normalize = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const compact = (value: string): string => normalize(value).replace(/\s+/g, "");

function acronym(value: string): string {
  return normalize(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join("");
}

export type HolderNameIdentity = {
  full: string;
  base: string;
  aliases: string[];
};

export function holderNameIdentity(value: string): HolderNameIdentity {
  const clean = value.trim();
  const full = normalize(clean);
  const trailing = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(clean);
  if (!trailing) return { full, base: full, aliases: [] };

  const base = normalize(trailing[1]);
  const possibleAlias = compact(trailing[2]);
  const expectedAcronym = acronym(trailing[1]);
  const isAcronym =
    possibleAlias.length >= 2 && possibleAlias === expectedAcronym;
  return isAcronym
    ? { full, base, aliases: [possibleAlias] }
    : { full, base: full, aliases: [] };
}

function identityScore(input: HolderNameIdentity, candidate: HolderNameIdentity) {
  if (!input.full || !candidate.full) return 0;
  if (input.base === candidate.base) return 100;
  if (
    input.aliases.includes(compact(candidate.full)) ||
    candidate.aliases.includes(compact(input.full))
  ) {
    return 90;
  }

  const inputAcronym = acronym(input.base);
  const candidateAcronym = acronym(candidate.base);
  if (
    inputAcronym.length >= 2 &&
    inputAcronym === candidateAcronym &&
    (compact(input.full) === inputAcronym ||
      compact(candidate.full) === candidateAcronym)
  ) {
    return 70;
  }
  return 0;
}

/**
 * Return one unambiguous match, preferring the shortest canonical display name.
 * If the strongest shorthand matches several different base identities, do not
 * guess; the reviewer can merge or choose the correct holder.
 */
export function findHolderMatch<T extends { name: string }>(
  name: string,
  holders: T[]
): T | null {
  const input = holderNameIdentity(name);
  const scored = holders
    .map((holder) => ({
      holder,
      identity: holderNameIdentity(holder.name),
      score: identityScore(input, holderNameIdentity(holder.name)),
    }))
    .filter((entry) => entry.score > 0);
  if (scored.length === 0) return null;

  const bestScore = Math.max(...scored.map((entry) => entry.score));
  const strongest = scored.filter((entry) => entry.score === bestScore);
  const bases = new Set(strongest.map((entry) => entry.identity.base));
  if (bases.size > 1) return null;

  return strongest.sort(
    (a, b) =>
      a.holder.name.length - b.holder.name.length ||
      a.holder.name.localeCompare(b.holder.name)
  )[0].holder;
}

export function holderNamesEquivalent(a: string, b: string): boolean {
  return findHolderMatch(a, [{ name: b }]) != null;
}
