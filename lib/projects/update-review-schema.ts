export const PROJECT_UPDATE_REVIEW_PROMPT_VERSION = 2;

export const PROJECT_UPDATE_REVIEW_SCHEMA = {
  name: "project_update_reviews",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      reviews: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            updateId: { type: "string" },
            summary: { type: "string" },
            priority: { type: "string", enum: ["low", "medium", "high"] },
            needsManagerAttention: { type: "boolean" },
            recommendations: {
              type: "array",
              maxItems: 3,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  kind: {
                    type: "string",
                    enum: [
                      "create_task",
                      "clarify",
                      "resolve_blocker",
                      "update_plan",
                      "monitor",
                    ],
                  },
                  title: { type: "string" },
                  reason: { type: "string" },
                },
                required: ["kind", "title", "reason"],
              },
            },
          },
          required: [
            "updateId",
            "summary",
            "priority",
            "needsManagerAttention",
            "recommendations",
          ],
        },
      },
    },
    required: ["reviews"],
  },
} as const;

export type ProjectUpdateRecommendationKind =
  | "create_task"
  | "clarify"
  | "resolve_blocker"
  | "update_plan"
  | "monitor";

export type ProjectUpdateAnalysis = {
  summary: string;
  priority: "low" | "medium" | "high";
  needsManagerAttention: boolean;
  recommendations: {
    kind: ProjectUpdateRecommendationKind;
    title: string;
    reason: string;
  }[];
  promptVersion: number;
};

type NormalizedReview = {
  updateId: string;
  analysis: ProjectUpdateAnalysis;
};

const PRIORITIES = new Set(["low", "medium", "high"]);
const KINDS = new Set([
  "create_task",
  "clarify",
  "resolve_blocker",
  "update_plan",
  "monitor",
]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Treat model output as untrusted and retain only reviews for supplied IDs. */
export function normalizeProjectUpdateReviews(
  value: unknown,
  allowedUpdateIds: ReadonlySet<string>
): NormalizedReview[] {
  const root = record(value);
  const reviews = Array.isArray(root?.reviews) ? root.reviews : [];
  const seen = new Set<string>();
  const normalized: NormalizedReview[] = [];

  for (const candidate of reviews) {
    const row = record(candidate);
    const updateId = cleanText(row?.updateId, 80);
    if (!updateId || !allowedUpdateIds.has(updateId) || seen.has(updateId)) continue;

    const summary = cleanText(row?.summary, 320);
    if (!summary) continue;

    const priority = PRIORITIES.has(String(row?.priority))
      ? (row?.priority as ProjectUpdateAnalysis["priority"])
      : "low";
    const recommendationRows = Array.isArray(row?.recommendations)
      ? row.recommendations
      : [];
    const recommendationTitles = new Set<string>();
    const recommendations: ProjectUpdateAnalysis["recommendations"] = [];

    for (const rawRecommendation of recommendationRows) {
      if (recommendations.length >= 3) break;
      const recommendation = record(rawRecommendation);
      const kind = String(recommendation?.kind ?? "");
      const title = cleanText(recommendation?.title, 180);
      const reason = cleanText(recommendation?.reason, 280);
      const key = title.toLocaleLowerCase();
      if (!KINDS.has(kind) || !title || !reason || recommendationTitles.has(key)) {
        continue;
      }
      recommendationTitles.add(key);
      recommendations.push({
        kind: kind as ProjectUpdateRecommendationKind,
        title,
        reason,
      });
    }

    seen.add(updateId);
    normalized.push({
      updateId,
      analysis: {
        summary,
        priority,
        needsManagerAttention:
          row?.needsManagerAttention === true && recommendations.length > 0,
        recommendations,
        promptVersion: PROJECT_UPDATE_REVIEW_PROMPT_VERSION,
      },
    });
  }

  return normalized;
}
