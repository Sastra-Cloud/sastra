import { describe, expect, it } from "vitest";

import {
  analyzeAssistantTurn,
  containsInternalUuid,
  isDirectTaskRequest,
  isDurableAssistantPreference,
  isLikelyUserCorrection,
  userRequestedInternalIds,
} from "./learning-signals";
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
  it.each([
    "No, I wasn't asking for a stand-up, I was saying, make a task for me.",
    "You don't need to tell me the Task ID.",
    "That's not what I asked for.",
    "Actually, assign it to Bora instead.",
    "Please don't include unrelated open items.",
  ])("recognizes explicit corrections: %s", (text) => {
    expect(isLikelyUserCorrection(text)).toBe(true);
  });

  it.each([
    "Create a task for me to finish the index.",
    "Make a task to call the printer tomorrow.",
    "Add this as a task for me.",
  ])("recognizes direct task requests: %s", (text) => {
    expect(isDirectTaskRequest(text)).toBe(true);
  });

  it("does not mistake ordinary conversation for a correction", () => {
    expect(isLikelyUserCorrection("What tasks are due this week?")).toBe(false);
  });

  it("distinguishes requested ids from accidental UUID disclosure", () => {
    expect(userRequestedInternalIds("What is the task ID?")).toBe(true);
    expect(
      containsInternalUuid("Created task 18557b31-0ad0-4f7d-8f63-21f6af87f547")
    ).toBe(true);
  });

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
