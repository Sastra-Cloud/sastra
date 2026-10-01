import { describe, expect, it, vi } from "vitest";
import { assertSupportedDatabase, assertSupportedVersion, checkDatabase } from "../../scripts/database-preflight.mjs";

describe("PostgreSQL minimum version", () => {
  it.each([170010, 160015, 0, undefined, "invalid", 180000.5])("rejects %s with a safe requirements link", (version) => {
    expect(() => assertSupportedVersion(version)).toThrow(/requires PostgreSQL 18.*Database requirements:/);
  });
  it.each([180000, 180006, "180006", 190000])("accepts %s", (version) => {
    expect(assertSupportedVersion(version)).toBe(Number(version));
  });
  it("queries server_version_num and rejects before the caller proceeds", async () => {
    const sql = vi.fn().mockResolvedValue([{ version_num: 170010 }]);
    // The real driver is a callable tagged template; the stub returns its rows.
    await expect(assertSupportedDatabase(sql as never)).rejects.toThrow(/Detected PostgreSQL 17/);
    expect(sql.mock.calls[0][0][0]).toContain("server_version_num");
  });
  it("reports missing configuration without connection details", async () => {
    await expect(checkDatabase(undefined)).rejects.toThrow("DATABASE_URL is not set");
  });
});
