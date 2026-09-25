import { describe, expect, it } from "vitest";

import { reciprocalRankFusion } from "./retrieval";

describe("agreement retrieval", () => {
  it("fuses lexical and semantic rankings without duplicates", () => {
    expect(
      reciprocalRankFusion([
        ["exact", "shared", "lexical"],
        ["shared", "semantic", "exact"],
      ])
    ).toEqual(["shared", "exact", "semantic", "lexical"]);
  });

  it("is deterministic when scores tie", () => {
    expect(reciprocalRankFusion([["b"], ["a"]])).toEqual(["a", "b"]);
  });
});

