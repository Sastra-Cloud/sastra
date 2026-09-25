/**
 * Central prompt registry. Prompts stay co-located with their schemas (they're
 * versioned together), but this barrel gives one import point and a manifest so
 * changes are traceable: bump the entry's `version` whenever you meaningfully
 * edit a prompt, and the eval report (`pnpm eval`) prints the versions it ran
 * against. Pure module — safe to import from scripts.
 */

export {
  INTERVIEW_SYSTEM_PROMPT,
  PLAN_SYSTEM_PROMPT,
  TASK_PLAN_SYSTEM_PROMPT,
} from "@/lib/ai/plan-schema";
export { EXTRACTION_SYSTEM_PROMPT } from "@/lib/imports/schema";
export { PRINT_QUOTE_SYSTEM_PROMPT } from "@/lib/print/extract-schema";
export { PRINT_TEXT_QUOTE_SYSTEM_PROMPT } from "@/lib/print/text-extract-schema";

export type PromptManifestEntry = {
  /** aiTaskModels task key this prompt serves. */
  taskKey: string;
  promptName: string;
  /** Bump on meaningful prompt edits so eval results are traceable. */
  version: number;
  file: string;
};

export const PROMPT_MANIFEST: PromptManifestEntry[] = [
  {
    taskKey: "planner",
    promptName: "INTERVIEW_SYSTEM_PROMPT",
    version: 1,
    file: "lib/ai/plan-schema.ts",
  },
  {
    taskKey: "planner",
    promptName: "PLAN_SYSTEM_PROMPT",
    version: 1,
    file: "lib/ai/plan-schema.ts",
  },
  {
    taskKey: "planner",
    promptName: "TASK_PLAN_SYSTEM_PROMPT",
    version: 1,
    file: "lib/ai/plan-schema.ts",
  },
  {
    taskKey: "doc_import",
    promptName: "EXTRACTION_SYSTEM_PROMPT",
    version: 1,
    file: "lib/imports/schema.ts",
  },
  {
    taskKey: "agreement_qa",
    promptName: "AGREEMENT_QA_SYSTEM_PROMPT",
    version: 1,
    file: "lib/agreement-chat/prompt.ts",
  },
  {
    taskKey: "print_quote_extract",
    promptName: "PRINT_QUOTE_SYSTEM_PROMPT",
    version: 1,
    file: "lib/print/extract-schema.ts",
  },
  {
    taskKey: "print_text_quote_extract",
    promptName: "PRINT_TEXT_QUOTE_SYSTEM_PROMPT",
    version: 1,
    file: "lib/print/text-extract-schema.ts",
  },
  // Context-built prompts (not constants, listed for completeness):
  {
    taskKey: "assistant",
    promptName: "systemPrompt() — built per turn",
    version: 2,
    file: "lib/assistant/prompt.ts",
  },
  {
    taskKey: "assistant_complex",
    promptName: "systemPrompt() — complex routed turns",
    version: 2,
    file: "lib/assistant/prompt.ts · lib/assistant/routing.ts",
  },
  {
    taskKey: "assistant_summary",
    promptName: "conversation compaction prompt",
    version: 1,
    file: "lib/assistant/context.ts",
  },
  {
    taskKey: "assistant_reflection",
    promptName: "gated reflection candidate prompt",
    version: 1,
    file: "lib/assistant/reflection.ts",
  },
  {
    taskKey: "project_update_review",
    promptName: "daily project update review prompt",
    version: 1,
    file: "lib/projects/update-review.ts",
  },
  {
    taskKey: "email_project_signal",
    promptName: "project, counterparty, and grant-reminder correspondence classifier",
    version: 3,
    file: "lib/email/project-signal.ts",
  },
  {
    taskKey: "email_task_signal",
    promptName: "safe forwarded-email task classifier",
    version: 1,
    file: "lib/email/task-suggestions.ts",
  },
  {
    taskKey: "email_follow_up_summary",
    promptName: "external follow-up waiting-state summarizer",
    version: 1,
    file: "lib/email/follow-ups.ts",
  },
  {
    taskKey: "email_rights_document",
    promptName: "review-first rights document classifier",
    version: 1,
    file: "lib/email/rights-review.ts",
  },
  {
    taskKey: "email_signal_reflection",
    promptName: "gated intake negative-lesson reflection prompt",
    version: 1,
    file: "lib/email/signal-reflection.ts",
  },
  {
    taskKey: "assistant_eval",
    promptName: "blind lesson evaluation prompt",
    version: 1,
    file: "lib/assistant/evals.ts",
  },
  {
    taskKey: "email_draft",
    promptName: "draftWithAi()/composeWith — built per call",
    version: 1,
    file: "lib/print/actions.ts · lib/assistant/tools.ts",
  },
  {
    taskKey: "standup_insights",
    promptName: "inline system prompt",
    version: 1,
    file: "lib/standup/insights.ts",
  },
];
