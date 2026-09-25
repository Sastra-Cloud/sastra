import { describe, expect, it } from "vitest";

import { PROJECT_KIND_LABELS, projectUnitTerms } from "./kinds";

describe("project kinds", () => {
  it("treats article projects as collections of article units", () => {
    expect(PROJECT_KIND_LABELS.article).toBe("Article collection");
    expect(projectUnitTerms("article")).toEqual({
      singular: "article",
      plural: "articles",
    });
  });

  it("uses publishing-specific unit terminology", () => {
    expect(projectUnitTerms("book").plural).toBe("chapters");
    expect(projectUnitTerms("podcast").plural).toBe("episodes");
    expect(projectUnitTerms(null).plural).toBe("units");
  });
});
