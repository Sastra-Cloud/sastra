import { describe, expect, it } from "vitest";

import { looksLikePooler, resolveDbClientOptions } from "./config";

describe("resolveDbClientOptions", () => {
  it("uses sensible defaults", () => {
    expect(resolveDbClientOptions({ DATABASE_URL: "postgres://u:p@db.internal:5432/app" })).toEqual({
      max: 10,
      idle_timeout: 120,
      connect_timeout: 10,
      prepare: true,
    });
  });

  it("reads pool size, idle timeout, and connect timeout from the environment", () => {
    expect(
      resolveDbClientOptions({
        DB_MAX_CONNECTIONS: "3",
        DB_IDLE_TIMEOUT: "20",
        DB_CONNECT_TIMEOUT: "5",
      })
    ).toMatchObject({ max: 3, idle_timeout: 20, connect_timeout: 5 });
  });

  it("ignores nonsense values and lets 0 mean never close", () => {
    expect(resolveDbClientOptions({ DB_MAX_CONNECTIONS: "-2", DB_IDLE_TIMEOUT: "abc" })).toMatchObject({
      max: 10,
      idle_timeout: 120,
    });
    expect(resolveDbClientOptions({ DB_IDLE_TIMEOUT: "0" }).idle_timeout).toBeUndefined();
  });

  it("disables prepared statements behind a pooler unless told otherwise", () => {
    const pooled = "postgres://u:p@ep-cool-1234-pooler.ap-southeast-1.aws.neon.tech/app";
    expect(looksLikePooler(pooled)).toBe(true);
    expect(resolveDbClientOptions({ DATABASE_URL: pooled }).prepare).toBe(false);
    expect(resolveDbClientOptions({ DATABASE_URL: pooled, DB_PREPARE: "true" }).prepare).toBe(true);
    expect(resolveDbClientOptions({ DATABASE_URL: "postgres://u:p@db/app", DB_PREPARE: "false" }).prepare).toBe(
      false
    );
    expect(looksLikePooler("not a url")).toBe(false);
  });

  it("lets a caller pin the pool size", () => {
    expect(resolveDbClientOptions({ DB_MAX_CONNECTIONS: "10" }, { max: 3 }).max).toBe(3);
  });
});
