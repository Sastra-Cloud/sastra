import { describe, expect, it } from "vitest";

import { describeReprocessResult } from "./reprocess-feedback";

describe("describeReprocessResult", () => {
  it("does not present an existing print match as a review item", () => {
    expect(
      describeReprocessResult({ printLinked: true }, "email")
    ).toEqual({
      title: "Email reprocessed",
      description:
        "Matched existing print correspondence. No new review item was created.",
      tone: "info",
      destination: null,
    });
  });

  it("points task and AI suggestions to the thread review area", () => {
    const result = describeReprocessResult(
      { taskSuggestionsCreated: 2, aiSuggestionCreated: true },
      "email"
    );
    expect(result.destination).toBe("thread-review");
    expect(result.description).toBe(
      "2 task suggestions and an AI suggestion in the thread review area above."
    );
  });

  it("names project status suggestions created from proof emails", () => {
    const result = describeReprocessResult(
      { projectUpdateSuggestionsCreated: 1 },
      "email"
    );
    expect(result.destination).toBe("thread-review");
    expect(result.description).toBe(
      "1 project status suggestion in the thread review area above."
    );
  });

  it("points quotes and proofs to the project Print tab", () => {
    const result = describeReprocessResult(
      { quotesCreated: 2, proofFilesStored: 1 },
      "thread"
    );
    expect(result.destination).toBe("project-print");
    expect(result.description).toBe(
      "2 quote suggestions and 1 restored print proof on the linked project's Print tab."
    );
  });

  it("states clearly when nothing new was found", () => {
    expect(describeReprocessResult({}, "email").description).toBe(
      "No new matches or review items were found."
    );
  });
});
