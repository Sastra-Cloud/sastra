/**
 * Where the corresponding source for the running build lives. Sastra is AGPL
 * licensed, so every installation links to the exact code it runs: the commit
 * when the image build recorded one, else the release tag, else the repository.
 * Forks set `SASTRA_SOURCE_REPOSITORY_URL` so the link points at their code.
 */
export const DEFAULT_SOURCE_REPOSITORY_URL = "https://github.com/Sastra-Cloud/sastra";

export function sourceRepositoryUrl(env: Record<string, string | undefined> = process.env): string {
  return (env.SASTRA_SOURCE_REPOSITORY_URL?.trim() || DEFAULT_SOURCE_REPOSITORY_URL).replace(/\/+$/, "");
}

/** `1.2.0` from `v1.2.0` or `1.2.0`; null for blanks. */
export function cleanVersion(version: string | null | undefined): string | null {
  const trimmed = version?.trim().replace(/^v/i, "");
  return trimmed ? trimmed : null;
}

export function sourceUrlFor(
  build: { version: string | null; revision: string | null; taggedRelease: boolean },
  repository = sourceRepositoryUrl()
): string {
  if (build.revision) return `${repository}/tree/${encodeURIComponent(build.revision)}`;
  const version = cleanVersion(build.version);
  if (build.taggedRelease && version) return `${repository}/releases/tag/v${encodeURIComponent(version)}`;
  return repository;
}
