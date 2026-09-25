/**
 * The published dependency-audit feed. The public repository's daily
 * security workflow audits `main` and the latest release tags and publishes
 * the results as one JSON file; every installation reads the entry for the
 * version it runs. No token, no webhook, nothing to configure for a normal
 * install. `SECURITY_STATUS_URL` points a fork at its own feed; `off` disables.
 *
 * Pure apart from `fetchSecurityStatusFeed`, whose fetch is injectable.
 */
import { cleanVersion } from "@/lib/ops/source-url";

export const DEFAULT_SECURITY_STATUS_URL =
  "https://raw.githubusercontent.com/Sastra-Cloud/sastra/security-status/security-status.json";

export type SecurityStatusEntry = {
  status: "passed" | "failed";
  checkedAt: string;
  commit?: string;
};

export type SecurityStatusFeed = {
  schemaVersion: 1;
  repository?: string;
  checkedAt: string;
  refs: Record<string, SecurityStatusEntry>;
  latestRelease?: string | null;
};

export function securityStatusFeedUrl(
  env: Record<string, string | undefined> = process.env
): string | null {
  const configured = env.SECURITY_STATUS_URL?.trim();
  if (configured === undefined || configured === "") return DEFAULT_SECURITY_STATUS_URL;
  if (configured.toLowerCase() === "off") return null;
  return configured;
}

export function securityStatusFeedConfigured(
  env: Record<string, string | undefined> = process.env
): boolean {
  return securityStatusFeedUrl(env) !== null;
}

/** The feed key for a build: its release tag, or `main` for untagged builds. */
export function securityStatusRefFor(build: {
  version: string | null;
  taggedRelease: boolean;
}): string {
  const version = cleanVersion(build.version);
  return build.taggedRelease && version ? `v${version}` : "main";
}

function isEntry(value: unknown): value is SecurityStatusEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    (entry.status === "passed" || entry.status === "failed") &&
    typeof entry.checkedAt === "string" &&
    !Number.isNaN(Date.parse(entry.checkedAt))
  );
}

/** Validate a fetched document; null when it is not a feed we understand. */
export function parseSecurityStatusFeed(value: unknown): SecurityStatusFeed | null {
  if (!value || typeof value !== "object") return null;
  const doc = value as Record<string, unknown>;
  if (doc.schemaVersion !== 1 || !doc.refs || typeof doc.refs !== "object") return null;
  const refs: Record<string, SecurityStatusEntry> = {};
  for (const [ref, entry] of Object.entries(doc.refs as Record<string, unknown>)) {
    if (isEntry(entry)) refs[ref] = entry;
  }
  return {
    schemaVersion: 1,
    repository: typeof doc.repository === "string" ? doc.repository : undefined,
    checkedAt: typeof doc.checkedAt === "string" ? doc.checkedAt : new Date(0).toISOString(),
    refs,
    latestRelease: typeof doc.latestRelease === "string" ? doc.latestRelease : null,
  };
}

/** The audit result that applies to this build, or null when none was published for it. */
export function selectSecurityStatus(
  feed: SecurityStatusFeed,
  build: { version: string | null; taggedRelease: boolean }
): { status: "passed" | "failed"; checkedAt: Date; ref: string } | null {
  const ref = securityStatusRefFor(build);
  const entry = feed.refs[ref];
  if (!entry) return null;
  return { status: entry.status, checkedAt: new Date(entry.checkedAt), ref };
}

export async function fetchSecurityStatusFeed(options: {
  url: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<SecurityStatusFeed | null> {
  const doFetch = options.fetchImpl ?? fetch;
  const response = await doFetch(options.url, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
  });
  if (!response.ok) return null;
  return parseSecurityStatusFeed(await response.json().catch(() => null));
}
