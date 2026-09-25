import { describe, expect, it } from "vitest";

import { resolveStorageConfig, StorageConfigError } from "./config";

const r2 = {
  R2_ENDPOINT: "https://acct.r2.cloudflarestorage.com",
  R2_BUCKET: "r2-bucket",
  R2_ACCESS_KEY_ID: "r2-key",
  R2_SECRET_ACCESS_KEY: "r2-secret",
};

const s3 = {
  S3_ENDPOINT: "https://storage.railway.app",
  S3_BUCKET: "s3-bucket",
  S3_ACCESS_KEY_ID: "s3-key",
  S3_SECRET_ACCESS_KEY: "s3-secret",
};

describe("resolveStorageConfig", () => {
  it("reads the existing R2_* names unchanged with region defaulting to auto", () => {
    expect(resolveStorageConfig(r2)).toEqual({
      endpoint: r2.R2_ENDPOINT,
      bucket: r2.R2_BUCKET,
      region: "auto",
      accessKeyId: r2.R2_ACCESS_KEY_ID,
      secretAccessKey: r2.R2_SECRET_ACCESS_KEY,
    });
  });

  it("accepts the generic S3_* names as aliases", () => {
    expect(resolveStorageConfig(s3)).toEqual({
      endpoint: s3.S3_ENDPOINT,
      bucket: s3.S3_BUCKET,
      region: "auto",
      accessKeyId: s3.S3_ACCESS_KEY_ID,
      secretAccessKey: s3.S3_SECRET_ACCESS_KEY,
    });
  });

  it("prefers R2_* when both spellings are set", () => {
    const config = resolveStorageConfig({ ...s3, ...r2, S3_REGION: "us-east-1", R2_REGION: "auto" });
    expect(config.endpoint).toBe(r2.R2_ENDPOINT);
    expect(config.bucket).toBe(r2.R2_BUCKET);
    expect(config.accessKeyId).toBe(r2.R2_ACCESS_KEY_ID);
    expect(config.secretAccessKey).toBe(r2.R2_SECRET_ACCESS_KEY);
    expect(config.region).toBe("auto");
  });

  it("resolves each setting independently so names can be mixed", () => {
    const config = resolveStorageConfig({
      R2_ENDPOINT: r2.R2_ENDPOINT,
      S3_BUCKET: s3.S3_BUCKET,
      S3_ACCESS_KEY_ID: s3.S3_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY: r2.R2_SECRET_ACCESS_KEY,
    });
    expect(config.bucket).toBe(s3.S3_BUCKET);
    expect(config.accessKeyId).toBe(s3.S3_ACCESS_KEY_ID);
  });

  it("makes the region configurable under either name", () => {
    expect(resolveStorageConfig({ ...s3, S3_REGION: "us-east-1" }).region).toBe(
      "us-east-1"
    );
    expect(resolveStorageConfig({ ...r2, R2_REGION: "weur" }).region).toBe("weur");
  });

  it("treats blank values as unset and falls through to the alias", () => {
    const config = resolveStorageConfig({ ...s3, R2_BUCKET: "", R2_ENDPOINT: "  " });
    expect(config.bucket).toBe(s3.S3_BUCKET);
    expect(config.endpoint).toBe(s3.S3_ENDPOINT);
  });

  it("names every missing variable in both spellings", () => {
    expect(() => resolveStorageConfig({ R2_ENDPOINT: r2.R2_ENDPOINT })).toThrow(
      StorageConfigError
    );
    try {
      resolveStorageConfig({ R2_ENDPOINT: r2.R2_ENDPOINT });
    } catch (error) {
      const err = error as StorageConfigError;
      expect(err.missing).toEqual([
        "R2_BUCKET (or S3_BUCKET)",
        "R2_ACCESS_KEY_ID (or S3_ACCESS_KEY_ID)",
        "R2_SECRET_ACCESS_KEY (or S3_SECRET_ACCESS_KEY)",
      ]);
      expect(err.message).toContain("R2_BUCKET (or S3_BUCKET)");
    }
  });
});
