import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

import pkg from "@/package.json";

/**
 * What is running: the semantic version and, when the platform provides them,
 * the source revision and image digest. `SASTRA_VERSION` overrides the package
 * version so a release image can carry its tag.
 */
export type RunningVersion = {
  /** Deployment identity, falling back to BUILD_ID for older images. */
  id: string;
  version: string;
  revision: string | null;
  digest: string | null;
  /** True when SASTRA_VERSION came from a release build rather than package.json. */
  taggedRelease: boolean;
};

let cachedBuildId: string | null = null;

function buildId(): string {
  if (process.env.NODE_ENV !== "production") return "dev";
  if (cachedBuildId) return cachedBuildId;
  try {
    const manifest = JSON.parse(readFileSync(
      path.join(process.cwd(), ".next", "required-server-files.json"), "utf8"
    ));
    const id = manifest.config?.deploymentId;
    if (typeof id === "string" && id) {
      cachedBuildId = id;
      return id;
    }
  } catch { /* Older image or development server. */ }
  try {
    const id = readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim();
    if (id) {
      cachedBuildId = id;
      return id;
    }
  } catch {
    /* dev server / no build id yet */
  }
  return "dev";
}

function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function runningVersion(): RunningVersion {
  return {
    id: buildId(),
    version: blankToNull(process.env.SASTRA_VERSION) ?? pkg.version,
    taggedRelease: blankToNull(process.env.SASTRA_VERSION) !== null,
    revision: blankToNull(process.env.SASTRA_REVISION),
    digest: blankToNull(process.env.SASTRA_IMAGE_DIGEST),
  };
}
