import { describe, expect, it } from "vitest";
import { inboxHref, inboxPage } from "./inbox-filters";
describe("correspondence navigation", () => {
  const current = { bucket: "project", q: "Rights & printing", project: "sample", status: "waiting", page: "3" };
  it("keeps filters and resets pagination on category change", () => {
    const result = new URL(inboxHref(current, { bucket: "other", page: undefined }), "https://example.test");
    expect(Object.fromEntries(result.searchParams)).toEqual({ bucket: "other", q: current.q, project: "sample", status: "waiting" });
  });
  it("changes pages without losing filters and clears only the requested filter", () => {
    expect(inboxHref(current, { page: "4" })).toContain("page=4");
    expect(inboxHref(current, { project: undefined })).not.toContain("project=sample");
    expect(inboxHref(current, { project: undefined })).toContain("status=waiting");
  });
  it.each([undefined, "-1", "NaN", "1.5", "Infinity"])("normalizes invalid page %s", value => expect(inboxPage(value)).toBe(1));
});
