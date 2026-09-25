/**
 * Curated OpenRouter model catalog + per-task metadata for the admin Settings ▸ AI
 * picker. Pure data (no server imports) so the client component can render it.
 *
 * Prices are indicative USD per 1M tokens (input/output) as of July 2026 and are
 * for guidance only — actual spend is billed by OpenRouter's returned `usage.cost`.
 * Any OpenRouter `provider/model` slug also works via the "Custom…" option, so this
 * list does not need to be exhaustive.
 */

export type ModelTier = "cheap" | "balanced" | "premium";

export type CatalogModel = {
  slug: string;
  label: string;
  tier: ModelTier;
  /** Indicative USD per 1M input tokens. */
  inPrice: number;
  /** Indicative USD per 1M output tokens. */
  outPrice: number;
  /** Reads images/PDFs natively (required for the doc_import task). */
  vision?: boolean;
  notes?: string;
};

export const MODEL_CATALOG: CatalogModel[] = [
  // ── Cheap ──
  {
    slug: "google/gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash Lite",
    tier: "cheap",
    inPrice: 0.1,
    outPrice: 0.4,
    vision: true,
    notes: "Cheapest; fast. Fine for simple tasks.",
  },
  {
    slug: "deepseek/deepseek-chat",
    label: "DeepSeek V4 Flash",
    tier: "cheap",
    inPrice: 0.14,
    outPrice: 0.28,
    notes: "Very cheap; decent general quality.",
  },
  {
    slug: "openai/gpt-5-mini",
    label: "GPT-5 Mini",
    tier: "cheap",
    inPrice: 0.25,
    outPrice: 2.0,
    vision: true,
    notes: "Reliable native tool-calling. Great for the assistant.",
  },
  // ── Balanced ──
  {
    slug: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    tier: "balanced",
    inPrice: 0.3,
    outPrice: 2.5,
    vision: true,
    notes: "Strong tool-calling, 1M context.",
  },
  {
    slug: "openai/gpt-5.4-mini",
    label: "GPT-5.4 Mini",
    tier: "balanced",
    inPrice: 0.75,
    outPrice: 4.5,
    vision: true,
    notes: "Newer mini; strong reasoning + tool use.",
  },
  {
    slug: "anthropic/claude-haiku-4.5",
    label: "Claude Haiku 4.5",
    tier: "balanced",
    inPrice: 1.0,
    outPrice: 5.0,
    vision: true,
    notes: "Near-Sonnet quality, fast. Good all-rounder.",
  },
  // ── Premium ──
  {
    slug: "openai/gpt-5.4",
    label: "GPT-5.4",
    tier: "premium",
    inPrice: 2.5,
    outPrice: 15.0,
    vision: true,
    notes: "Long-context document reasoning; agreement Q&A fallback.",
  },
  {
    slug: "anthropic/claude-sonnet-5",
    label: "Claude Sonnet 5",
    tier: "premium",
    inPrice: 2.0,
    outPrice: 10.0,
    vision: true,
    notes: "Best writing/tone + instruction-following. 1M context.",
  },
  {
    slug: "google/gemini-3.1-pro",
    label: "Gemini 3.1 Pro",
    tier: "premium",
    inPrice: 2.0,
    outPrice: 12.0,
    vision: true,
    notes: "Flagship reasoning; strong vision.",
  },
  {
    slug: "anthropic/claude-sonnet-4.6",
    label: "Claude Sonnet 4.6",
    tier: "premium",
    inPrice: 3.0,
    outPrice: 15.0,
    vision: true,
    notes: "Production workhorse; near-Opus quality.",
  },
  {
    slug: "anthropic/claude-sonnet-4.5",
    label: "Claude Sonnet 4.5",
    tier: "premium",
    inPrice: 3.0,
    outPrice: 15.0,
    vision: true,
    notes: "Reliable structured output; used by the planner.",
  },
  {
    slug: "anthropic/claude-opus-4.8",
    label: "Claude Opus 4.8",
    tier: "premium",
    inPrice: 5.0,
    outPrice: 25.0,
    vision: true,
    notes: "Top intelligence; use only where depth is worth it.",
  },
  {
    slug: "openai/gpt-5.5",
    label: "GPT-5.5",
    tier: "premium",
    inPrice: 5.0,
    outPrice: 30.0,
    vision: true,
    notes: "Strong knowledge work + chat.",
  },
];

export const TIER_ORDER: ModelTier[] = ["cheap", "balanced", "premium"];

export const TIER_LABELS: Record<ModelTier, string> = {
  cheap: "Cheap",
  balanced: "Balanced",
  premium: "Premium",
};

export type TaskMeta = {
  label: string;
  description: string;
  /** Recommended default OpenRouter slug for this task. */
  recommended: string;
  /** Display order in the admin list (lower = first). */
  order: number;
  /** Capability the task requires — flagged in the picker if the model lacks it. */
  requires?: "vision";
};

/** Metadata for every configurable AI task (keyed by `ai_task_models.taskKey`). */
export const TASK_META: Record<string, TaskMeta> = {
  assistant: {
    label: "Assistant (agentic)",
    description:
      "The in-app helper that runs tools on your behalf. High-volume and cost-gated per user — favour a cheap, reliable tool-calling model.",
    recommended: "openai/gpt-5-mini",
    order: 0,
  },
  assistant_complex: {
    label: "Assistant (complex workflows)",
    description:
      "Handles multi-step, correspondence, rights, finance, and destructive workflows. Routed selectively and still approval-gated.",
    recommended: "openai/gpt-5.4-mini",
    order: 1,
  },
  assistant_summary: {
    label: "Assistant conversation summaries",
    description:
      "Compacts older turns into structured conversation state. This is separate from durable user memory.",
    recommended: "openai/gpt-5-mini",
    order: 2,
  },
  assistant_reflection: {
    label: "Assistant reflection",
    description:
      "Studies redacted, settled failures and corrections to propose review-only procedural lessons.",
    recommended: "openai/gpt-5.4-mini",
    order: 3,
  },
  project_update_review: {
    label: "Daily project update review",
    description:
      "Compares new project status updates with tasks, blockers, budget, rights, and deadlines to suggest manager follow-ups.",
    recommended: "openai/gpt-5-mini",
    order: 4,
  },
  email_project_signal: {
    label: "Correspondence signal detection",
    description:
      "Reviews inbound correspondence and suggests possible new publishing projects, rights holders, funding partners, and printers for manager review.",
    recommended: "openai/gpt-5-mini",
    order: 5,
  },
  email_task_signal: {
    label: "Forwarded email task detection",
    description:
      "Finds concrete follow-up work in deliberate internal forwards. Explicit instructions can create a self-owned task; inferred work always requires review.",
    recommended: "openai/gpt-5-mini",
    order: 6,
  },
  email_follow_up_summary: {
    label: "External email follow-up summaries",
    description:
      "Turns the newest outbound project email into a short waiting-state summary while ignoring quoted history.",
    recommended: "openai/gpt-5-mini",
    order: 7,
  },
  email_rights_document: {
    label: "Email rights documents",
    description:
      "Reads only project-linked PDFs that look like signed agreements or license-fee receipts, then prepares a manager-reviewed update.",
    recommended: "openai/gpt-5-mini",
    order: 8,
    requires: "vision",
  },
  assistant_eval: {
    label: "Assistant lesson evaluator",
    description:
      "Runs repeated blind champion/challenger checks before a proposed lesson can be approved.",
    recommended: "openai/gpt-5.4-mini",
    order: 6,
  },
  email_draft: {
    label: "Email drafting",
    description:
      "Composes rights, partner, print, and finance emails for your approval. Writing quality and tone matter here, so a stronger model is usually worth it.",
    recommended: "anthropic/claude-sonnet-5",
    order: 8,
  },
  planner: {
    label: "Project planner",
    description:
      "Runs the planning interview and generates the structured project/task plan. Needs reliable structured output.",
    recommended: "anthropic/claude-sonnet-4.5",
    order: 8,
  },
  doc_import: {
    label: "Document import",
    description:
      "Reads MoU/licence PDFs and extracts structured budget/rights data. Requires a vision-capable model.",
    recommended: "anthropic/claude-sonnet-5",
    order: 9,
    requires: "vision",
  },
  agreement_ocr: {
    label: "Agreement OCR cleanup",
    description:
      "Faithfully cleans and returns text from scanned MoU and License PDFs after the PDF OCR parser runs. A cheaper model is usually sufficient.",
    recommended: "openai/gpt-5-mini",
    order: 9,
  },
  agreement_qa: {
    label: "Agreement Q&A",
    description:
      "Answers read-only questions from selected project MoU and License text with server-validated clause citations. Long context and precise structured output matter.",
    recommended: "anthropic/claude-sonnet-5",
    order: 10,
  },
  standup_insights: {
    label: "Standup insights",
    description:
      "Summarises standups and flags impediments. Low-stakes background task — a cheap model is fine.",
    recommended: "anthropic/claude-haiku-4.5",
    order: 10,
  },
  print_quote_extract: {
    label: "Print quote extraction",
    description:
      "Reads printer quote/invoice PDFs or images and extracts quantity, pricing, and specs. Requires a vision-capable model.",
    recommended: "anthropic/claude-sonnet-5",
    order: 10,
    requires: "vision",
  },
};

/** Look up catalog metadata for a slug (undefined for custom slugs). */
export function findModel(slug: string): CatalogModel | undefined {
  return MODEL_CATALOG.find((m) => m.slug === slug);
}

/** Whether a slug is known to be vision-capable (false for unknown custom slugs). */
export function isVisionModel(slug: string): boolean {
  return findModel(slug)?.vision ?? false;
}

/** Compact price hint like "$0.25/$2 per 1M" for a slug, or null if unknown. */
export function priceHint(slug: string): string | null {
  const m = findModel(slug);
  if (!m) return null;
  const fmt = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);
  return `${fmt(m.inPrice)}/${fmt(m.outPrice)} per 1M`;
}
