import { describe, expect, it } from "vitest";

import {
  parseToolArgs,
  partitionToolCalls,
  strictToolParameters,
  stripReasoning,
  ToolArgumentError,
} from "./agent-util";
import type { StoredToolCall } from "./types";

const call = (name: string): StoredToolCall => ({
  id: `c_${name}`,
  type: "function",
  function: { name, arguments: "{}" },
});

const isWrite = (n: string) => n.startsWith("create_") || n.startsWith("set_");

describe("partitionToolCalls", () => {
  it("separates auto (read/memory) from write calls", () => {
    const { auto, writes } = partitionToolCalls(
      [call("list_projects"), call("create_task"), call("remember"), call("set_task_status")],
      isWrite
    );
    expect(auto.map((c) => c.function.name)).toEqual(["list_projects", "remember"]);
    expect(writes.map((c) => c.function.name)).toEqual(["create_task", "set_task_status"]);
  });

  it("handles all-auto and all-write batches", () => {
    expect(partitionToolCalls([call("list_people")], isWrite).writes).toHaveLength(0);
    expect(partitionToolCalls([call("create_task")], isWrite).auto).toHaveLength(0);
  });
});

describe("parseToolArgs", () => {
  const schema = {
    type: "object",
    properties: {
      title: { type: "string" },
      priority: { type: "string", enum: ["low", "high"] },
    },
    required: ["title"],
  };

  it("parses valid objects and strips strict-mode null optionals", () => {
    expect(parseToolArgs('{"title":"Draft","priority":null}', schema)).toEqual({
      title: "Draft",
    });
  });

  it("strips strict-mode null optionals inside array objects", () => {
    const nested = {
      type: "object",
      properties: {
        lines: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              partnerLabel: { type: "string" },
            },
            required: ["label"],
          },
        },
      },
      required: ["lines"],
    };
    expect(
      parseToolArgs(
        '{"lines":[{"label":"Translation","partnerLabel":null}]}',
        nested
      )
    ).toEqual({ lines: [{ label: "Translation" }] });
  });

  it("rejects malformed, missing, mistyped, enum, and extra values", () => {
    for (const raw of [
      "not json",
      "123",
      "{}",
      '{"title":3}',
      '{"title":"Draft","priority":"urgent"}',
      '{"title":"Draft","surprise":true}',
    ]) {
      expect(() => parseToolArgs(raw, schema)).toThrow(ToolArgumentError);
    }
  });
});

describe("stripReasoning", () => {
  it("removes a closed reasoning block and keeps the final answer", () => {
    expect(
      stripReasoning(
        "<think>1) follow the rules. Compose reply.</think>I created the task for you."
      )
    ).toBe("I created the task for you.");
  });

  it("strips multiple tag variants anywhere in the text", () => {
    expect(
      stripReasoning(
        "<thinking>plan</thinking>Done.<analysis>double-check</analysis>"
      )
    ).toBe("Done.");
  });

  it("drops an unclosed trailing reasoning block", () => {
    expect(
      stripReasoning("Here is your answer.\n<think>now let me second-guess")
    ).toBe("Here is your answer.");
  });

  it("leaves ordinary text (including stray angle brackets) untouched", () => {
    expect(stripReasoning("Budget is < $500 and title uses <b> loosely")).toBe(
      "Budget is < $500 and title uses <b> loosely"
    );
  });

  it("handles null/empty content", () => {
    expect(stripReasoning(null)).toBe("");
    expect(stripReasoning(undefined)).toBe("");
    expect(stripReasoning("   ")).toBe("");
  });
});

describe("strictToolParameters", () => {
  it("closes objects and makes authored optional fields required + nullable", () => {
    expect(
      strictToolParameters({
        type: "object",
        properties: { title: { type: "string" }, note: { type: "string" } },
        required: ["title"],
      })
    ).toEqual({
      type: "object",
      properties: {
        title: { type: "string" },
        note: { anyOf: [{ type: "string" }, { type: "null" }] },
      },
      required: ["title", "note"],
      additionalProperties: false,
    });
  });
});
