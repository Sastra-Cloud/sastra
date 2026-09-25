import { describe, expect, it } from "vitest";

import {
  DEFAULT_CAPACITY_GROUPS,
  groupForKind,
  normalizeGroups,
  type CapacityGroup,
} from "./groups";

describe("groupForKind", () => {
  it("maps a kind to its group", () => {
    expect(groupForKind(DEFAULT_CAPACITY_GROUPS, "book")?.key).toBe("books");
    expect(groupForKind(DEFAULT_CAPACITY_GROUPS, "podcast")?.key).toBe("media");
    expect(groupForKind(DEFAULT_CAPACITY_GROUPS, "article")?.key).toBe("media");
  });
  it("treats an untyped (null) project as a book", () => {
    expect(groupForKind(DEFAULT_CAPACITY_GROUPS, null)?.key).toBe("books");
  });
  it("falls back to the first group when nothing matches", () => {
    const groups: CapacityGroup[] = [{ key: "a", name: "A", concurrency: 1, kinds: ["book"] }];
    expect(groupForKind(groups, "podcast")?.key).toBe("a");
    expect(groupForKind([], "book")).toBeNull();
  });
});

describe("normalizeGroups", () => {
  it("dedupes a kind claimed by two groups (first wins)", () => {
    const groups: CapacityGroup[] = [
      { key: "a", name: "A", concurrency: 2, kinds: ["book", "article", "video_series", "other"] },
      { key: "b", name: "B", concurrency: 1, kinds: ["article", "podcast"] },
    ];
    const norm = normalizeGroups(groups);
    // article is claimed by both → stays with a; every kind covered so no rehoming
    expect(norm.find((g) => g.key === "a")!.kinds).toEqual(["book", "article", "video_series", "other"]);
    expect(norm.find((g) => g.key === "b")!.kinds).toEqual(["podcast"]);
  });
  it("drops empty groups", () => {
    const groups: CapacityGroup[] = [
      { key: "a", name: "A", concurrency: 2, kinds: ["book", "article", "podcast"] },
      { key: "b", name: "B", concurrency: 1, kinds: ["book"] }, // all taken → empty
    ];
    const norm = normalizeGroups(groups);
    expect(norm.map((g) => g.key)).toEqual(["a"]);
  });
  it("puts any uncovered kind into the first group so nothing is orphaned", () => {
    const groups: CapacityGroup[] = [{ key: "a", name: "A", concurrency: 2, kinds: ["book"] }];
    const norm = normalizeGroups(groups);
    expect(norm[0].kinds).toEqual(expect.arrayContaining(["book", "article", "podcast", "other"]));
  });
  it("upgrades legacy groups by putting video beside article and podcast", () => {
    const groups: CapacityGroup[] = [
      { key: "books", name: "Editorial books", concurrency: 2, kinds: ["book"] },
      { key: "creative", name: "Creative", concurrency: 4, kinds: ["article", "podcast", "other"] },
    ];
    const norm = normalizeGroups(groups);
    expect(norm.find((group) => group.key === "creative")?.kinds).toContain(
      "video_series"
    );
    expect(norm.find((group) => group.key === "creative")?.name).toBe("Creative");
    expect(norm.find((group) => group.key === "creative")?.concurrency).toBe(4);
  });
  it("renames only the historical shared-media defaults", () => {
    const groups: CapacityGroup[] = [
      { key: "books", name: "Books", concurrency: 2, kinds: ["book"] },
      { key: "media", name: "Articles & podcasts", concurrency: 4, kinds: ["article", "podcast", "other"] },
    ];
    const norm = normalizeGroups(groups);
    expect(norm.find((group) => group.key === "media")?.name).toBe(
      "Creative media"
    );

    const custom = normalizeGroups([
      { key: "media", name: "Campaign studio", concurrency: 4, kinds: ["article", "podcast", "video_series", "other"] },
    ]);
    expect(custom[0].name).toBe("Campaign studio");
  });
});
