ALTER TABLE "assistant_reflection_runs" ADD COLUMN IF NOT EXISTS "evidence_breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "assistant_reflection_runs" ADD COLUMN IF NOT EXISTS "decision_summary" text;
