import { describe, expect, it } from "vitest";

import {
  findHolderMatch,
  holderNameIdentity,
  holderNamesEquivalent,
} from "./holder-match";

describe("publisher identity matching", () => {
  it("treats a trailing acronym as shorthand for the same publisher", () => {
    expect(holderNamesEquivalent("Union Publishing", "Union Publishing (UP)"))
      .toBe(true);
    expect(findHolderMatch("UP", [{ id: "union", name: "Union Publishing (UP)" }]))
      .toMatchObject({ id: "union" });
  });

  it("prefers the shorter canonical name when duplicate spellings exist", () => {
    expect(
      findHolderMatch("Union Publishing (UP)", [
        { id: "short", name: "Union Publishing" },
        { id: "long", name: "Union Publishing (UP)" },
      ])
    ).toMatchObject({ id: "short" });
  });

  it("does not strip a meaningful parenthetical qualifier", () => {
    expect(holderNameIdentity("Example Press (UK)").base).toBe(
      "example press uk"
    );
    expect(holderNamesEquivalent("Example Press (UK)", "Example Press (US)"))
      .toBe(false);
  });

  it("does not guess when an acronym is ambiguous", () => {
    expect(
      findHolderMatch("UP", [
        { id: "union", name: "Union Publishing (UP)" },
        { id: "united", name: "United Press (UP)" },
      ])
    ).toBeNull();
  });

  it("does not collapse mere substrings", () => {
    expect(holderNamesEquivalent("Union", "Union Publishing")).toBe(false);
  });
});
