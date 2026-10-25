export type ProjectCandidate = { id: string; name: string | null; sourceLanguage: string; targetLanguage: string; slug?: string };
export type ProjectMatch = ProjectCandidate & { match: "same_title" | "similar_title" | "same_languages" | null };
export type ProjectMatchInput = { name: string; sourceLanguage: string; targetLanguage: string };

const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Suggestions only. A shared title or language never authorizes or creates a link. */
export function rankProjectMatches(projects: ProjectCandidate[], input: ProjectMatchInput): ProjectMatch[] {
  const title = normalize(input.name), words = new Set(title.split(" ").filter(Boolean));
  return projects.map(project => {
    const other = normalize(project.name || ""), tokens = new Set(other.split(" ").filter(Boolean));
    const shared = [...words].filter(word => tokens.has(word)).length;
    const similar = title.length >= 4 && other.length >= 4 && (title.includes(other) || other.includes(title) || shared / Math.max(words.size, tokens.size, 1) >= 0.5);
    const languages = normalize(project.sourceLanguage) === normalize(input.sourceLanguage) && normalize(project.targetLanguage) === normalize(input.targetLanguage);
    const match: ProjectMatch["match"] = title && title === other ? "same_title" : similar ? "similar_title" : languages ? "same_languages" : null;
    return { project: { ...project, match }, score: (match === "same_title" ? 100 : match === "similar_title" ? 50 : 0) + (languages ? 10 : 0) };
  }).sort((a, b) => b.score - a.score || (a.project.name || "").localeCompare(b.project.name || "") || a.project.id.localeCompare(b.project.id))
    .map(row => row.project);
}
