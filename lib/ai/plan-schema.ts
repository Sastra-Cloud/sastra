import { z } from "zod";

import type { ProposedPlan } from "./types";

export const proposedTaskSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  roleKey: z.string().nullable().optional(),
  offsetDays: z.number().nullable().optional(),
  isPerUnit: z.boolean().nullable().optional(),
});

export const proposedPhaseSchema = z.object({
  name: z.string().min(1),
  roleKey: z.string().nullable().optional(),
  durationDays: z.number().nullable().optional(),
  tasks: z.array(proposedTaskSchema),
});

export const proposedPlanSchema = z.object({
  projectTitle: z.string().min(1),
  summary: z.string().nullable().optional(),
  assumptions: z.array(z.string()).nullable().optional(),
  risks: z.array(z.string()).nullable().optional(),
  suggestedUnits: z.array(z.string()),
  suggestedRoles: z.array(z.string()),
  phases: z.array(proposedPhaseSchema),
});

/** Strict-mode JSON Schema for OpenRouter response_format (optionals as nullable). */
export const PROPOSED_PLAN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "projectTitle",
    "summary",
    "assumptions",
    "risks",
    "suggestedUnits",
    "suggestedRoles",
    "phases",
  ],
  properties: {
    projectTitle: { type: "string" },
    summary: { type: "string" },
    assumptions: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
    suggestedUnits: { type: "array", items: { type: "string" } },
    suggestedRoles: { type: "array", items: { type: "string" } },
    phases: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "roleKey", "durationDays", "tasks"],
        properties: {
          name: { type: "string" },
          roleKey: { type: ["string", "null"] },
          durationDays: { type: ["integer", "null"] },
          tasks: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "description", "roleKey", "offsetDays", "isPerUnit"],
              properties: {
                name: { type: "string" },
                description: { type: ["string", "null"] },
                roleKey: { type: ["string", "null"] },
                offsetDays: { type: ["integer", "null"] },
                isPerUnit: { type: "boolean" },
              },
            },
          },
        },
      },
    },
  },
} as const;

export function normalizePlan(raw: unknown): ProposedPlan {
  const p = proposedPlanSchema.parse(raw);
  return {
    projectTitle: p.projectTitle,
    summary: p.summary ?? undefined,
    assumptions: p.assumptions ?? [],
    risks: p.risks ?? [],
    suggestedUnits: p.suggestedUnits ?? [],
    suggestedRoles: p.suggestedRoles ?? [],
    phases: p.phases.map((ph) => ({
      name: ph.name,
      roleKey: ph.roleKey ?? undefined,
      durationDays: ph.durationDays ?? undefined,
      tasks: ph.tasks.map((t) => ({
        name: t.name,
        description: t.description ?? undefined,
        roleKey: t.roleKey ?? undefined,
        offsetDays: t.offsetDays ?? undefined,
        isPerUnit: t.isPerUnit ?? undefined,
      })),
    })),
  };
}

export const INTERVIEW_SYSTEM_PROMPT = `You are a project planner for an international book/article publishing team (translations, plus audio/video versions, requiring rights/permissions). Interview the user to understand a new project: is it a book or article? source/target languages? how many chapters/units? audio or video versions? rights/permissions needed? deadline? team/roles involved? Ask one focused question at a time, keep replies short, and don't produce the plan yet — just gather what you need. When you have enough, tell the user they can click "Generate plan".`;

export const PLAN_SYSTEM_PROMPT = `You are a project planner for an international book/article publishing team. From the conversation, produce a structured project plan as JSON matching the schema. Use an ordered set of phases (e.g. Rights & Permissions, Translation, Editing, Proofreading, Layout, Audio/Video, Marketing, Launch as appropriate). For per-chapter work (translation/editing/proofreading) set isPerUnit=true and list the chapters in suggestedUnits. Use roleKey values from: translation, editing, proofreading, layout, illustration, audio, video, marketing, rights. Set durationDays per phase and offsetDays per task (days after the phase start). Always include a Rights phase and a Marketing phase for books/articles. Include concise assumptions for anything inferred from the interview, and risks for anything the manager should verify before committing.`;

// ── Project-scoped task-plan generation (the AI pipeline wizard) ──────────────

/** Signals about an existing project, fed to the task-plan model. */
export type ProjectPlanSignals = {
  title: string;
  description?: string | null;
  kind: "book" | "article" | "podcast" | "video_series" | "other";
  videoProductionMode: "original" | "translation" | null;
  detail: "minimal" | "standard" | "detailed";
  chapterCount: number;
  chapterNames: string[]; // capped
  producesPrint: boolean;
  producesEbook: boolean;
  producesAudio: boolean;
  producesVideo: boolean;
  wordCount: number;
  existingPhaseNames: string[];
};

export function renderPlanSignals(s: ProjectPlanSignals): string {
  return "SIGNALS:\n" + JSON.stringify(s, null, 2);
}

/**
 * The canonical coordinator pipeline (project_roles.key, in order) the model
 * must choose from. Mirrors the seeded roles.
 */
export const PIPELINE_ROLE_KEYS = [
  "rights",
  "translation",
  "first_edit",
  "proofread",
  "final_edit",
  "layout",
  "post_layout_proof",
  "marketing",
  "printing",
  "audio",
  "video",
  "illustration",
] as const;

export const TASK_PLAN_SYSTEM_PROMPT = `You are a production planner for a translation-publishing ministry. You are given a trusted WORKSPACE CONTEXT and a SIGNALS block describing an EXISTING project. Use the configured source/target languages and ministry context; do not assume a language, country, organization, religion, or currency that the context does not state. Produce a structured task plan as JSON matching the schema, tailored to those signals. Each phase is one ordered pipeline STAGE with a coordinator role.

Rules:
- Each phase has a "roleKey" from this set ONLY: ${PIPELINE_ROLE_KEYS.join(", ")}. Give every phase exactly one roleKey (its coordinator stage). Put one task in each phase (its work), named for the stage.
- The standard book pipeline, in order, is: rights → translation → first_edit → proofread → final_edit → layout → post_layout_proof → marketing → printing. Use this ordered backbone for kind="book".
- For kind="article", treat the project as a COLLECTION whose "chapters" are individual ARTICLES. Use a lean pipeline: rights → translation → first_edit → proofread → marketing (no layout/printing unless clearly needed). Fan translation, first_edit, proofread, any audio/video work, and final publication out per article. Rights and collection-level marketing stay project-wide.
- For kind="podcast", use an audio pipeline: rights → translation → audio → proofread → marketing (no layout/printing/illustration). Here "chapters" are EPISODES; per-unit fan-out applies to translation/audio/proofread. Assume producesAudio.
- For kind="video_series" with videoProductionMode="original", use: rights → first_edit (concept/outline) → final_edit (write and approve script) → video → proofread (video review) → marketing. Here "chapters" are VIDEOS and editorial/video/review work fans out per video. Do not add translation or standalone audio phases.
- For kind="video_series" with videoProductionMode="translation", use: rights → translation → proofread (translation approval) → video → final_edit (video review) → marketing. Here "chapters" are VIDEOS and translation/video/review work fans out per video. Do not add standalone audio phases.
- Include "audio" and/or "video" phases (after editing, before marketing) ONLY if producesAudio / producesVideo is true. Include "illustration" (cover) for books.
- ALWAYS start with a "rights" phase and include a "marketing" phase.
- Detail level controls per-chapter fan-out (isPerUnit):
  - "minimal": isPerUnit=false everywhere (one task per stage for the whole work).
  - "standard": isPerUnit=true for translation, first_edit, proofread, final_edit, post_layout_proof; false for rights/layout/marketing/printing/illustration.
  - "detailed": isPerUnit=true for every per-chapter-able stage (translation, first_edit, proofread, final_edit, layout, post_layout_proof).
- Leave "suggestedUnits" EMPTY — the system already has the chapter list. Set "durationDays" per phase (a sensible default in days). Set offsetDays=0 on tasks. projectTitle MUST equal the provided title verbatim.
- Do not propose a phase whose name already appears in existingPhaseNames.
- Include concise assumptions for anything inferred from signals/instructions, and risks for anything the manager should verify before committing.`;
