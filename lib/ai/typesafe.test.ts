import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const systemOne = vi.fn();
const getAiUsageSettings = vi.fn();
const recordAiUsage = vi.fn();

vi.mock("@typesafe-ai/sdk", async () => {
  const actual =
    await vi.importActual<typeof import("@typesafe-ai/sdk")>("@typesafe-ai/sdk");
  return {
    ...actual,
    TypeSafeClient: class {
      systemOne = systemOne;
    },
  };
});

vi.mock("./usage", () => ({
  getAiUsageSettings: () => getAiUsageSettings(),
  recordAiUsage: (input: unknown) => recordAiUsage(input),
}));

const { jevJudge, jevCostUsd, shouldUseJev, summarizeAnswers, typesafeConfigured } =
  await import("./typesafe");

const answers = {
  isUrgent: { type: "noul", noul: 0.8 },
  queue: {
    type: "choice",
    choice: "billing",
    confidence: 0.9,
    probabilities: { billing: 0.9, other: 0.1 },
  },
};

function okResult() {
  return {
    model: "jev-1.13.0",
    answers,
    usage: { input_tokens: 700, output_tokens: 0 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TYPESAFEAI_API_KEY = "test-key";
  getAiUsageSettings.mockResolvedValue({ typesafeEnabled: true });
  systemOne.mockResolvedValue(okResult());
});

afterEach(() => {
  delete process.env.TYPESAFEAI_API_KEY;
  vi.restoreAllMocks();
});

const request = {
  state: { note: "hello" },
  questions: {},
  metering: { feature: "correspondence", operation: "test" },
} as never;

describe("shouldUseJev", () => {
  it("requires both a key and the workspace switch", () => {
    expect(shouldUseJev({ configured: true, enabled: true })).toBe(true);
    expect(shouldUseJev({ configured: true, enabled: false })).toBe(false);
    expect(shouldUseJev({ configured: false, enabled: true })).toBe(false);
    expect(shouldUseJev({ configured: false, enabled: false })).toBe(false);
  });
});

describe("typesafeConfigured", () => {
  it("reports whether the server has a key", () => {
    expect(typesafeConfigured()).toBe(true);
    delete process.env.TYPESAFEAI_API_KEY;
    expect(typesafeConfigured()).toBe(false);
  });
});

describe("jevCostUsd", () => {
  it("prices input tokens at the flat rate", () => {
    expect(jevCostUsd(1_000_000)).toBeCloseTo(0.042, 6);
    expect(jevCostUsd(0)).toBe(0);
    expect(jevCostUsd(-5)).toBe(0);
  });
});

describe("summarizeAnswers", () => {
  it("keeps probabilities and drops everything else", () => {
    expect(summarizeAnswers(answers)).toEqual({
      isUrgent: { noul: 0.8 },
      queue: { choice: "billing", confidence: 0.9 },
    });
  });

  it("ignores values that are not answers", () => {
    expect(summarizeAnswers({ junk: "text", nothing: null })).toEqual({});
  });
});

describe("jevJudge", () => {
  it("returns answers and meters the call on success", async () => {
    const result = await jevJudge({
      ...(request as object),
      decide: () => "skip",
    } as never);
    expect(result?.answers).toEqual(answers);
    expect(systemOne).toHaveBeenCalledTimes(1);
    expect(recordAiUsage).toHaveBeenCalledTimes(1);
    const metered = recordAiUsage.mock.calls[0][0];
    expect(metered.provider).toBe("typesafe");
    expect(metered.model).toBe("jev-1.13.0");
    expect(metered.promptTokens).toBe(700);
    expect(metered.costUsd).toBeCloseTo(jevCostUsd(700), 10);
    expect(metered.metadata.decision).toBe("skip");
    expect(metered.metadata.answers).toEqual({
      isUrgent: { noul: 0.8 },
      queue: { choice: "billing", confidence: 0.9 },
    });
  });

  it("never sends the judged state to the usage ledger", async () => {
    await jevJudge(request);
    const metered = recordAiUsage.mock.calls[0][0];
    expect(JSON.stringify(metered)).not.toContain("hello");
  });

  it("returns null without calling out when the switch is off", async () => {
    getAiUsageSettings.mockResolvedValue({ typesafeEnabled: false });
    expect(await jevJudge(request)).toBeNull();
    expect(systemOne).not.toHaveBeenCalled();
    expect(recordAiUsage).not.toHaveBeenCalled();
  });

  it("returns null without calling out when no key is set", async () => {
    delete process.env.TYPESAFEAI_API_KEY;
    expect(await jevJudge(request)).toBeNull();
    expect(systemOne).not.toHaveBeenCalled();
  });

  it("returns null when the service fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    systemOne.mockRejectedValue(new Error("rate limited"));
    expect(await jevJudge(request)).toBeNull();
    expect(recordAiUsage).not.toHaveBeenCalled();
  });

  it("returns null when the settings lookup fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getAiUsageSettings.mockRejectedValue(new Error("db down"));
    expect(await jevJudge(request)).toBeNull();
    expect(systemOne).not.toHaveBeenCalled();
  });

  it("returns null when the call outruns its deadline", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    systemOne.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 200))
    );
    expect(await jevJudge({ ...(request as object), timeoutMs: 20 } as never)).toBeNull();
  });

  it("still returns answers when metering fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    recordAiUsage.mockRejectedValue(new Error("insert failed"));
    const result = await jevJudge(request);
    expect(result?.answers).toEqual(answers);
  });

  it("still returns answers when the decision helper throws", async () => {
    const result = await jevJudge({
      ...(request as object),
      decide: () => {
        throw new Error("bad helper");
      },
    } as never);
    expect(result?.answers).toEqual(answers);
    expect(recordAiUsage.mock.calls[0][0].metadata.decision).toBeUndefined();
  });
});
