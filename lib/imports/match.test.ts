import { describe, expect, it } from "vitest";

import { matchGrantProjects, matchProjects } from "./match";

const grantProjects = [
  { id: "a", title: "Calvin commentary", slug: "calvin", partnerName: "Cornerstone Trust", budgetTotalCents: 1_480_000 },
  { id: "b", title: "Weekly article", slug: "weekly", partnerName: "Cornerstone Trust", budgetTotalCents: 697_000 },
  { id: "c", title: "Study guides", slug: "study", partnerName: "Cornerstone Trust", budgetTotalCents: 814_000 },
  { id: "d", title: "Testimony videos", slug: "videos", partnerName: "Cornerstone Trust", budgetTotalCents: 1_200_000 },
  { id: "e", title: "Unrelated book", slug: "other", partnerName: "Desiring God", budgetTotalCents: 500_000 },
  { id: "f", title: "No partner", slug: "none", partnerName: null, budgetTotalCents: 100_000 },
];

describe("matchGrantProjects", () => {
  it("finds the funder's projects and confirms the total reconciles", () => {
    const match = matchGrantProjects("Cornerstone Trust", 4_191_000, grantProjects);
    expect(match).not.toBeNull();
    expect(match!.siblings.map((s) => s.id)).toEqual(["a", "b", "c", "d"]);
    expect(match!.totalCents).toBe(4_191_000);
    expect(match!.matchesTotal).toBe(true);
  });

  it("matches the partner even when the agreement total differs", () => {
    const match = matchGrantProjects("Cornerstone Trust", 9_999_999, grantProjects);
    expect(match!.siblings).toHaveLength(4);
    expect(match!.matchesTotal).toBe(false);
  });

  it("normalizes partner punctuation/case", () => {
    const match = matchGrantProjects("cornerstone  trust!", null, grantProjects);
    expect(match!.siblings).toHaveLength(4);
    expect(match!.matchesTotal).toBe(false); // no total supplied
  });

  it("returns null when no project shares the funder", () => {
    expect(matchGrantProjects("Crossway", 100, grantProjects)).toBeNull();
  });

  it("returns null for an empty/blank partner", () => {
    expect(matchGrantProjects("", 100, grantProjects)).toBeNull();
    expect(matchGrantProjects(null, 100, grantProjects)).toBeNull();
  });
});

describe("matchProjects (title)", () => {
  it("prefers an exact normalized title match", () => {
    const hits = matchProjects("Calvin Commentary", grantProjects);
    expect(hits[0].exact).toBe(true);
    expect(hits[0].project.id).toBe("a");
  });
});
