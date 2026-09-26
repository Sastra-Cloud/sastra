import { describe, expect, it } from "vitest";

import { databaseTransportIsSecure, sslModeOf } from "./database-transport-rules";

const pooled = "postgresql://u:p@ep-x-pooler.ap-southeast-1.aws.neon.tech/db";
const direct = "postgresql://u:p@db.internal:5432/db";

describe("database transport security", () => {
  it("trusts the server when it reports TLS", () => {
    expect(databaseTransportIsSecure({ serverReportsTls: true, connectionString: direct })).toBe(true);
  });

  it("behind a pooler, trusts our side only when it verifies the certificate", () => {
    expect(databaseTransportIsSecure({ serverReportsTls: false, connectionString: `${pooled}?sslmode=verify-full&channel_binding=require` })).toBe(true);
    expect(databaseTransportIsSecure({ serverReportsTls: false, connectionString: `${pooled}?sslmode=require` })).toBe(false);
    expect(databaseTransportIsSecure({ serverReportsTls: false, connectionString: pooled })).toBe(false);
  });

  it("does not trust a direct connection that Postgres says is not encrypted", () => {
    expect(databaseTransportIsSecure({ serverReportsTls: false, connectionString: `${direct}?sslmode=verify-full` })).toBe(false);
  });

  it("reads sslmode from the URL", () => {
    expect(sslModeOf(`${pooled}?channel_binding=require&sslmode=verify-full`)).toBe("verify-full");
    expect(sslModeOf("not a url")).toBeNull();
  });
});
