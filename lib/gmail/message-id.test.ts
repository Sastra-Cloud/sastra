import { describe, expect, it } from "vitest";

import { buildReferencesHeader, synthesizeMessageId } from "./message-id";

const base = {
  from: "sales@printer.com",
  date: new Date("2026-05-26T10:00:00Z"),
  subject: "Quote for 50 Crucial Questions",
  text: "1000 cps @ USD 1.76 per cpy",
};

describe("synthesizeMessageId", () => {
  it("is deterministic for the same content", () => {
    expect(synthesizeMessageId(base)).toBe(synthesizeMessageId(base));
  });

  it("is prefixed so synthetic ids are recognizable", () => {
    expect(synthesizeMessageId(base)).toMatch(/^synthetic-sha256:[0-9a-f]{64}$/);
  });

  it("differs when any content field changes", () => {
    const id = synthesizeMessageId(base);
    expect(synthesizeMessageId({ ...base, subject: "Different" })).not.toBe(id);
    expect(
      synthesizeMessageId({ ...base, from: "other@printer.com" })
    ).not.toBe(id);
    expect(
      synthesizeMessageId({ ...base, date: new Date("2026-05-27T10:00:00Z") })
    ).not.toBe(id);
  });

  it("normalizes sender casing so it stays stable", () => {
    expect(synthesizeMessageId({ ...base, from: "SALES@PRINTER.COM" })).toBe(
      synthesizeMessageId(base)
    );
  });

  it("handles missing fields", () => {
    expect(synthesizeMessageId({})).toMatch(/^synthetic-sha256:/);
  });
});

describe("buildReferencesHeader", () => {
  it("appends the parent once while preserving the RFC chain", () => {
    expect(
      buildReferencesHeader("<root@example.test> <mid@example.test>", "<mid@example.test>")
    ).toBe("<root@example.test> <mid@example.test>");
  });

  it("returns null for an empty chain", () => {
    expect(buildReferencesHeader(null, null)).toBeNull();
  });
});
