/**
 * Object storage settings, read from the environment.
 *
 * Sastra talks to any S3-compatible service (Cloudflare R2, Railway Buckets,
 * MinIO, AWS S3, ...). Existing deployments use `R2_*` names; self-hosters may
 * use the generic `S3_*` names instead. When both are set, `R2_*` wins.
 *
 * `R2_ACCOUNT_ID` is deliberately not part of this config: it is a Cloudflare
 * account id (also used as a fallback for Workers AI), not an S3 setting.
 */

export type StorageConfig = {
  endpoint: string;
  bucket: string;
  /** S3 signing region. Defaults to `"auto"`, which R2 and MinIO accept. */
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export type StorageEnv = Readonly<Partial<Record<string, string | undefined>>>;

export const DEFAULT_STORAGE_REGION = "auto";

/** Each setting with its preferred (`R2_*`) and alias (`S3_*`) variable names. */
export const STORAGE_ENV_NAMES = {
  endpoint: ["R2_ENDPOINT", "S3_ENDPOINT"],
  bucket: ["R2_BUCKET", "S3_BUCKET"],
  region: ["R2_REGION", "S3_REGION"],
  accessKeyId: ["R2_ACCESS_KEY_ID", "S3_ACCESS_KEY_ID"],
  secretAccessKey: ["R2_SECRET_ACCESS_KEY", "S3_SECRET_ACCESS_KEY"],
} as const satisfies Record<keyof StorageConfig, readonly [string, string]>;

export class StorageConfigError extends Error {
  constructor(readonly missing: readonly string[]) {
    super(`Object storage is not configured: set ${missing.join(", ")}.`);
    this.name = "StorageConfigError";
  }
}

function readFirst(
  env: StorageEnv,
  names: readonly string[]
): string | undefined {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

/**
 * Resolve the storage config from `env` (defaults to `process.env`). Throws a
 * `StorageConfigError` naming every missing variable (in both spellings) so a
 * misconfigured deployment fails with one clear message.
 */
export function resolveStorageConfig(
  env: StorageEnv = process.env
): StorageConfig {
  const missing: string[] = [];
  const pick = (key: keyof StorageConfig) => {
    const names = STORAGE_ENV_NAMES[key];
    const value = readFirst(env, names);
    if (!value) missing.push(`${names[0]} (or ${names[1]})`);
    return value ?? "";
  };

  const endpoint = pick("endpoint");
  const bucket = pick("bucket");
  const accessKeyId = pick("accessKeyId");
  const secretAccessKey = pick("secretAccessKey");
  const region =
    readFirst(env, STORAGE_ENV_NAMES.region) ?? DEFAULT_STORAGE_REGION;

  if (missing.length > 0) throw new StorageConfigError(missing);
  return { endpoint, bucket, region, accessKeyId, secretAccessKey };
}
