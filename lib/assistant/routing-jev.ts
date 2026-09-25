import "server-only";

import { noul } from "@typesafe-ai/sdk";

import { jevJudge } from "@/lib/ai/typesafe";
import { assistantTaskKeyFor } from "./routing";
import type { Role } from "./tools";

/**
 * Model routing for the assistant, judged instead of pattern-matched.
 *
 * {@link assistantTaskKeyFor} decides between the economical and the stronger
 * tool model with keyword regexes, which miss paraphrases ("can you put
 * together a note to the printer about the invoice") and misfire on words used
 * in another sense. A fast typed judgment answers the same three questions the
 * regexes approximate; the regex stays as the fallback whenever the judgment is
 * unavailable or unsure, so routing never depends on the service.
 */

export type AssistantTaskKey = "assistant" | "assistant_complex";

/** Treat a yes/no judgment as decided only outside this band. */
export const DECISIVE_TRUE_MIN = 0.7;
export const DECISIVE_FALSE_MAX = 0.3;

/** Long asks are multi-step regardless of wording; mirrors the regex rule. */
const MULTI_STEP_LENGTH = 500;

export type RoutingJudgment = {
  isSimpleProjectRead: { noul: number };
  isOperational: { noul: number };
  isMultiStep: { noul: number };
};

function decided(probability: number): boolean | null {
  if (!Number.isFinite(probability)) return null;
  if (probability >= DECISIVE_TRUE_MIN) return true;
  if (probability <= DECISIVE_FALSE_MAX) return false;
  return null;
}

/**
 * Apply the same routing rule as {@link assistantTaskKeyFor} to judged signals.
 * Returns `null` when any signal landed mid-band, meaning "use the regex".
 */
export function resolveTaskKeyFromJudgments(
  judgment: RoutingJudgment | null | undefined,
  text: string,
  role: Role
): AssistantTaskKey | null {
  if (!judgment) return null;
  const projectRead = decided(judgment.isSimpleProjectRead?.noul);
  const operational = decided(judgment.isOperational?.noul);
  const judgedMultiStep = decided(judgment.isMultiStep?.noul);
  if (projectRead === null || operational === null || judgedMultiStep === null) {
    return null;
  }
  const multiStep = judgedMultiStep || text.length > MULTI_STEP_LENGTH;
  if (projectRead && !multiStep) return "assistant";
  return (role !== "member" && operational) || multiStep
    ? "assistant_complex"
    : "assistant";
}

/** Pick the assistant model task key, falling back to the keyword rules. */
export async function resolveAssistantTaskKey(
  text: string,
  role: Role
): Promise<AssistantTaskKey> {
  const fallback = () => assistantTaskKeyFor(text, role);
  const judgment = await jevJudge({
    state: { message: text, askerRole: role },
    questions: {
      isSimpleProjectRead: noul(
        "Is `message` a read-only question about projects, tasks, schedules, or content status that can be answered by looking information up?",
        {
          true: "The person is asking to see or list existing information, and nothing would be created, changed, sent, or deleted.",
          false: "The person asks to change something, send something, or is not asking about project information at all.",
        }
      ),
      isOperational: noul(
        "Does `message` involve operationally sensitive work: email, rights, licences, royalties, payments, budgets, printers, or adding and removing people?",
        {
          true: "Carrying out the request would touch correspondence, rights and licensing, money, print production, or team membership.",
          false: "The request stays with ordinary project, task, or scheduling information.",
        }
      ),
      isMultiStep: noul(
        "Does `message` ask for several actions in sequence, a comparison across many items, or a plan?",
        {
          true: "Answering it well needs multiple steps, a comparison over many records, or drawing up a plan.",
          false: "A single lookup or a single action answers it.",
        }
      ),
    },
    metering: {
      scope: "member",
      feature: "assistant",
      operation: "route_model",
      taskKey: "assistant_routing",
    },
    decide: (result) =>
      `route:${resolveTaskKeyFromJudgments(result.answers, text, role) ?? fallback()}`,
  });
  return resolveTaskKeyFromJudgments(judgment?.answers, text, role) ?? fallback();
}
