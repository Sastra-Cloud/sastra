import { describe, expect, it } from "vitest";

import { analyzeAssistantTurn, isDurableAssistantPreference } from "./learning-signals";
import type { LearningTranscriptMessage } from "./learning-signals";

function assistantMessage(input: {
  content?: string;
  tools?: string[];
}): LearningTranscriptMessage {
  return {
    id: "assistant-1",
    userId: "user-1",
    role: "assistant",
    content: input.content ?? null,
    toolCalls: (input.tools ?? []).map((name) => ({
      id: `call-${name}`,
      type: "function" as const,
      function: { name, arguments: "{}" },
    })),
  };
}

describe("assistant learning signals", () => {

  it("captures durable response preferences without treating one-off safety requests as memory", () => {
    expect(
      isDurableAssistantPreference("You don't need to tell me internal task IDs.")
    ).toBe(true);
    expect(isDurableAssistantPreference("Please don't send that email yet.")).toBe(false);
  });

  it("flags a direct task turn that never proposes create_task", () => {
    expect(
      analyzeAssistantTurn("Create a task to finish the index.", [
        assistantMessage({ content: "Which project did you mean?" }),
      ])
    ).toMatchObject({ directTaskWithoutCreate: true });
    expect(
      analyzeAssistantTurn("Create a task to finish the index.", [
        assistantMessage({ tools: ["create_task"] }),
      ])
    ).toMatchObject({ directTaskWithoutCreate: false });
  });

  it("flags accidental UUID disclosure but permits an explicit ID request", () => {
    const response = assistantMessage({
      content: "Created task 18557b31-0ad0-4f7d-8f63-21f6af87f547.",
    });
    expect(analyzeAssistantTurn("Create the task.", [response])).toMatchObject({
      internalIdDisclosure: true,
    });
    expect(analyzeAssistantTurn("Create it and give me its ID.", [response])).toMatchObject({
      internalIdDisclosure: false,
    });
  });
});
