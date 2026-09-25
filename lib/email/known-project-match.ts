import "server-only";

import { choice } from "@typesafe-ai/sdk";

import { aiStructured } from "@/lib/ai/openrouter";
import { jevJudge } from "@/lib/ai/typesafe";
import { latestReplyText } from "@/lib/email/follow-up-policy";
import {
  NO_PROJECT_EVIDENCE,
  candidateOptionLabel,
  shouldSkipKnownProjectMatch,
} from "@/lib/email/known-project-jev";

export type KnownProjectCandidate = {
  id: string;
  title: string;
  slug: string;
};

function normalized(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function deterministicKnownProjectMatch(
  candidates: readonly KnownProjectCandidate[],
  content: string
): string | null {
  const haystack = normalized(content);
  if (!haystack) return candidates.length === 1 ? candidates[0].id : null;
  const matches = candidates.filter((candidate) => {
    const title = normalized(candidate.title);
    const slug = normalized(candidate.slug);
    return (title && haystack.includes(title)) || (slug && haystack.includes(slug));
  });
  if (matches.length === 1) return matches[0].id;
  return candidates.length === 1 ? candidates[0].id : null;
}

export function evidenceUniquelyIdentifiesProject(
  candidates: readonly KnownProjectCandidate[],
  projectId: string,
  evidence: string
): boolean {
  const clue = normalized(evidence);
  if (clue.length < 3) return false;
  const matches = candidates.filter((candidate) => {
    const title = normalized(candidate.title);
    const slug = normalized(candidate.slug);
    return title.includes(clue) || clue.includes(title) || slug.includes(clue);
  });
  return matches.length === 1 && matches[0].id === projectId;
}

const PROJECT_MATCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["projectId", "confidence", "evidence", "reason"],
  properties: {
    projectId: { type: ["string", "null"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    evidence: { type: "string" },
    reason: { type: "string" },
  },
} as const;

/**
 * Resolve one project from an already-trusted candidate set. A single saved
 * relationship or a unique title mention is deterministic. AI is only a
 * high-confidence tie-breaker among multiple known candidates, and its quoted
 * evidence must occur in the current message.
 */
export async function matchKnownProject(input: {
  candidates: readonly KnownProjectCandidate[];
  subject: string | null | undefined;
  bodyText: string | null | undefined;
  includeQuotedHistory?: boolean;
  relationship: "printer" | "funding_partner" | "rights_holder";
}): Promise<string | null> {
  if (!input.candidates.length) return null;
  const body = input.includeQuotedHistory
    ? (input.bodyText ?? "")
    : latestReplyText(input.bodyText);
  const content = [input.subject, body].filter(Boolean).join("\n").slice(0, 6_000);
  const deterministic = deterministicKnownProjectMatch(input.candidates, content);
  if (deterministic) return deterministic;
  if (input.candidates.length < 2 || !content.trim()) return null;

  // Most operational mail names no project at all, and the tie-breaker's own
  // answer is then null. A confident "nothing indicated" skips that call.
  const prescreen = await jevJudge({
    state: {
      relationship: input.relationship,
      currentMessage: content,
    },
    questions: {
      indicatedProject: choice(
        "Which of these projects does `currentMessage` concretely concern?",
        {
          ...Object.fromEntries(
            input.candidates.map((candidate, index) => [
              candidateOptionLabel(index),
              candidate.title,
            ])
          ),
          [NO_PROJECT_EVIDENCE]:
            "The message contains nothing that points to one of these projects in particular.",
        }
      ),
    },
    timeoutMs: 10_000,
    metering: {
      scope: "workspace",
      feature: "correspondence",
      operation: "prescreen_known_project",
      taskKey: "email_project_signal",
      entityType: "project",
    },
    decide: (result) =>
      shouldSkipKnownProjectMatch(result.answers) ? "skip" : "escalate",
  });
  if (shouldSkipKnownProjectMatch(prescreen?.answers)) return null;

  const raw = await aiStructured(
    "email_project_signal",
    [
      {
        role: "system",
        content:
          "Choose which existing project an operational email concerns. The candidate list comes from verified saved relationships and is exhaustive. Never invent or return a project outside it. Use only the current message, not assumptions. Return null unless the message contains concrete evidence that distinguishes one candidate. Copy the shortest decisive phrase verbatim into evidence.",
      },
      {
        role: "user",
        content: JSON.stringify({
          relationship: input.relationship,
          currentMessage: content,
          candidates: input.candidates,
        }),
      },
    ],
    { name: "known_project_match", schema: PROJECT_MATCH_SCHEMA },
    {
      metering: {
        scope: "workspace",
        feature: "correspondence",
        operation: "match_known_project",
        taskKey: "email_project_signal",
        entityType: "project",
      },
      timeoutMs: 30_000,
    }
  ).catch(() => null);

  if (!raw || typeof raw !== "object") return null;
  const result = raw as Record<string, unknown>;
  const projectId = typeof result.projectId === "string" ? result.projectId : null;
  const confidence = typeof result.confidence === "number" ? result.confidence : 0;
  const evidence = typeof result.evidence === "string" ? result.evidence.trim() : "";
  if (
    !projectId ||
    confidence < 0.9 ||
    evidence.length < 3 ||
    !input.candidates.some((candidate) => candidate.id === projectId) ||
    !normalized(content).includes(normalized(evidence)) ||
    !evidenceUniquelyIdentifiesProject(input.candidates, projectId, evidence)
  ) {
    return null;
  }
  return projectId;
}
