import "server-only";

import {
  TypeSafeClient,
  type Questions,
  type SystemOneResult,
} from "@typesafe-ai/sdk";

import { runAfterResponse } from "@/lib/after-response";

import { getAiUsageSettings, recordAiUsage, type AiMetering } from "./usage";

/**
 * TypeSafe "Jev" judgments: small typed decisions (yes/no, pick-one, graded)
 * used to pre-screen work before we spend a full LLM call.
 *
 * This layer is always optional. Every caller must behave exactly as it did
 * before when {@link jevJudge} returns `null` — which happens when the key is
 * missing, the super-admin switch is off, or anything at all goes wrong.
 */

/** Flat input-token price for Jev; output tokens are not billed. */
const JEV_INPUT_USD_PER_MTOK = 0.042;

/**
 * Per-attempt timeout. The SDK default (10s, 2 retries) is far too slow for a
 * gate whose entire purpose is to be cheaper than the call it replaces.
 */
const CLIENT_TIMEOUT_MS = 2_500;

/** Outer deadline, covering client construction and the settings lookup too. */
const DEFAULT_DEADLINE_MS = 4_000;

export function typesafeConfigured(): boolean {
  return !!process.env.TYPESAFEAI_API_KEY;
}

/** Pure gate, split out so the decision is testable without a DB or network. */
export function shouldUseJev(input: {
  configured: boolean;
  enabled: boolean;
}): boolean {
  return input.configured && input.enabled;
}

let cachedClient: TypeSafeClient | null = null;

function client(): TypeSafeClient {
  if (!cachedClient) {
    // The SDK reads TYPESAFE_API_KEY by default; this app stores the key as
    // TYPESAFEAI_API_KEY, so it is passed explicitly.
    cachedClient = new TypeSafeClient({
      apiKey: process.env.TYPESAFEAI_API_KEY,
      timeout: CLIENT_TIMEOUT_MS,
      retry: { maxRetries: 0 },
    });
  }
  return cachedClient;
}

/** Cost of a judgment, from the flat input-token rate. */
export function jevCostUsd(inputTokens: number): number {
  return (Math.max(0, inputTokens) / 1_000_000) * JEV_INPUT_USD_PER_MTOK;
}

/**
 * Compact answers for the usage ledger: probabilities and labels only, never
 * the state we judged. Email bodies must not end up in metadata.
 */
export function summarizeAnswers(
  answers: Record<string, unknown>
): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(answers)) {
    if (!value || typeof value !== "object") continue;
    const answer = value as Record<string, unknown>;
    if (answer.type === "noul") {
      summary[key] = { noul: answer.noul };
    } else if (answer.type === "choice") {
      summary[key] = {
        choice: answer.choice,
        confidence: answer.confidence,
      };
    } else if (answer.type === "score") {
      summary[key] = { score: answer.score, confidence: answer.confidence };
    }
  }
  return summary;
}

function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`TypeSafe judgment timed out after ${ms}ms`));
    }, ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export type JevMetering = Omit<AiMetering, "scope"> & {
  scope?: AiMetering["scope"];
};

export type JevJudgeInput<Q extends Questions> = {
  state: unknown;
  questions: Q;
  timeoutMs?: number;
  metering: JevMetering;
  /**
   * What the caller did with the judgment, e.g. "skip" or "escalate". Recorded
   * in the usage ledger so thresholds can be reviewed against real mail.
   */
  decide?: (result: SystemOneResult<Q>) => string;
};

/**
 * Ask Jev one batch of questions about one piece of state.
 *
 * Returns `null` whenever the judgment is unavailable for any reason. Callers
 * treat `null` as "proceed exactly as before".
 */
export async function jevJudge<const Q extends Questions>(
  input: JevJudgeInput<Q>
): Promise<SystemOneResult<Q> | null> {
  try {
    if (!typesafeConfigured()) return null;
    const settings = await getAiUsageSettings();
    if (!shouldUseJev({ configured: true, enabled: settings.typesafeEnabled })) {
      return null;
    }
    const result = await withDeadline(
      client().systemOne({
        state: input.state as never,
        questions: input.questions,
      }),
      input.timeoutMs ?? DEFAULT_DEADLINE_MS
    );
    let decision: string | null = null;
    try {
      decision = input.decide ? input.decide(result) : null;
    } catch {
      decision = null;
    }
    // Metering must not delay the judgment, but it must survive a host that
    // suspends the instance as soon as the response is sent.
    runAfterResponse("TypeSafe usage metering", () =>
      recordJudgmentUsage(result, input.metering, decision)
    );
    return result;
  } catch (error) {
    console.error("TypeSafe judgment failed:", error);
    return null;
  }
}

async function recordJudgmentUsage(
  result: {
    model: string;
    usage: { input_tokens: number; output_tokens: number };
    answers: Readonly<Record<string, unknown>>;
  },
  metering: JevMetering,
  decision: string | null
): Promise<void> {
  try {
    await recordAiUsage({
      provider: "typesafe",
      scope: metering.scope ?? "workspace",
      taskKey: metering.taskKey ?? null,
      feature: metering.feature,
      operation: metering.operation,
      model: result.model,
      userId: metering.userId ?? null,
      actorUserId: metering.actorUserId ?? null,
      projectId: metering.projectId ?? null,
      entityType: metering.entityType ?? null,
      entityId: metering.entityId ?? null,
      promptTokens: result.usage.input_tokens,
      completionTokens: result.usage.output_tokens,
      costUsd: jevCostUsd(result.usage.input_tokens),
      estimated: false,
      metadata: {
        ...metering.metadata,
        ...(decision ? { decision } : {}),
        answers: summarizeAnswers(result.answers),
      },
    });
  } catch (error) {
    console.error("TypeSafe usage metering failed:", error);
  }
}
