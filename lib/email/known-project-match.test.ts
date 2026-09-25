import { describe, expect, it } from "vitest";

import {
  deterministicKnownProjectMatch,
  evidenceUniquelyIdentifiesProject,
} from "./known-project-match";

const candidates = [
  { id: "discipling", title: "Discipling", slug: "discipling" },
  {
    id: "truth-for-life-1",
    title: "Truth for Life Volume 1",
    slug: "truth-for-life-volume-1",
  },
  {
    id: "truth-for-life-2",
    title: "Truth for Life Volume 2",
    slug: "truth-for-life-volume-2",
  },
];

describe("deterministicKnownProjectMatch", () => {
  it("matches a project title within a shared-printer candidate set", () => {
    expect(
      deterministicKnownProjectMatch(
        candidates,
        "Re: Re: Discipling\nWe will send the revised proof tomorrow."
      )
    ).toBe("discipling");
  });

  it("does not guess when several known projects remain ambiguous", () => {
    expect(
      deterministicKnownProjectMatch(
        candidates,
        "The revised proof will be ready tomorrow."
      )
    ).toBeNull();
  });

  it("uses a sole saved relationship without requiring a title mention", () => {
    expect(
      deterministicKnownProjectMatch(
        [candidates[0]],
        "The revised proof will be ready tomorrow."
      )
    ).toBe("discipling");
  });
});

describe("evidenceUniquelyIdentifiesProject", () => {
  it("accepts a partial title phrase that distinguishes one known candidate", () => {
    expect(
      evidenceUniquelyIdentifiesProject(candidates, "truth-for-life-2", "Volume 2")
    ).toBe(true);
  });

  it("rejects generic evidence shared by several candidates", () => {
    expect(
      evidenceUniquelyIdentifiesProject(
        candidates,
        "truth-for-life-2",
        "Truth for Life"
      )
    ).toBe(false);
    expect(
      evidenceUniquelyIdentifiesProject(candidates, "discipling", "revised proof")
    ).toBe(false);
  });
});
