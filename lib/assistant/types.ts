/** Shared assistant types used by the schema, agent loop, and UI. */

export type AssistantMessageRole = "user" | "assistant" | "tool";

/** OpenAI-shaped tool call as returned by the model and persisted on a turn. */
export type StoredToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

/** Read tools auto-run; write tools require approval; memory tools self-edit memory. */
export type ToolKind = "read" | "write" | "memory";

export type PendingActionStatus =
  | "pending"
  | "executing"
  | "approved"
  | "declined"
  | "executed"
  | "failed";

export type AssistantMessageStatus =
  | "complete"
  | "awaiting_approval"
  | "running"
  | "error";

export type AssistantMemoryCategory =
  | "preference"
  | "profile"
  | "working_style";

export type AssistantConversationSummary = {
  goals: string[];
  decisions: string[];
  entities: string[];
  openLoops: string[];
};

export type AssistantLessonScope = "global" | "tool" | "workflow";
