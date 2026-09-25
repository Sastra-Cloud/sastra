import { describe, expect, it } from "vitest";

import { normalizeProjectUpdateReviews } from "./update-review-schema";

describe("normalizeProjectUpdateReviews", () => {
  it("keeps bounded recommendations for known updates", () => {
    const result = normalizeProjectUpdateReviews(
      {
        reviews: [
          {
            updateId: "known",
            summary: "Printing is underway and marketing work is not tracked.",
            priority: "medium",
            needsManagerAttention: true,
            recommendations: [
              {
                kind: "create_task",
                title: "Build the marketing campaign",
                reason: "The update names this as unfinished work.",
              },
            ],
          },
          {
            updateId: "invented",
            summary: "Ignore this",
            priority: "high",
            needsManagerAttention: true,
            recommendations: [],
          },
        ],
      },
      new Set(["known"])
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      updateId: "known",
      analysis: {
        priority: "medium",
        needsManagerAttention: true,
        promptVersion: 2,
      },
    });
  });

  it("removes malformed and duplicate recommendations", () => {
    const result = normalizeProjectUpdateReviews(
      {
        reviews: [
          {
            updateId: "known",
            summary: "Informational update",
            priority: "unexpected",
            needsManagerAttention: true,
            recommendations: [
              { kind: "invented", title: "Bad", reason: "Bad kind" },
              { kind: "monitor", title: "Watch shipping", reason: "In transit" },
              { kind: "monitor", title: "Watch shipping", reason: "Duplicate" },
            ],
          },
        ],
      },
      new Set(["known"])
    );

    expect(result[0]?.analysis.priority).toBe("low");
    expect(result[0]?.analysis.recommendations).toHaveLength(1);
    expect(result[0]?.analysis.needsManagerAttention).toBe(true);
  });

  it("cannot request attention without an actionable recommendation", () => {
    const result = normalizeProjectUpdateReviews(
      {
        reviews: [
          {
            updateId: "known",
            summary: "No action is needed.",
            priority: "low",
            needsManagerAttention: true,
            recommendations: [],
          },
        ],
      },
      new Set(["known"])
    );

    expect(result[0]?.analysis.needsManagerAttention).toBe(false);
  });
});
