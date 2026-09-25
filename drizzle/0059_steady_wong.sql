ALTER TABLE "project_updates" ADD COLUMN "ai_analysis" jsonb;--> statement-breakpoint
ALTER TABLE "project_updates" ADD COLUMN "ai_analyzed_at" timestamp;--> statement-breakpoint
ALTER TABLE "project_updates" ADD COLUMN "ai_reviewed_at" timestamp;--> statement-breakpoint
CREATE INDEX "project_updates_ai_review_idx" ON "project_updates" USING btree ("parent_id","ai_analyzed_at","updated_at");--> statement-breakpoint
INSERT INTO "ai_task_models" ("task_key", "model", "fallback_models")
VALUES ('project_update_review', 'openai/gpt-5-mini', ARRAY['anthropic/claude-haiku-4.5'])
ON CONFLICT ("task_key") DO NOTHING;
