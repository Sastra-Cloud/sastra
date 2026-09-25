CREATE TABLE "assistant_conversation_summaries" (
	"user_id" text PRIMARY KEY NOT NULL,
	"summary" jsonb NOT NULL,
	"through_message_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_eval_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid,
	"name" text NOT NULL,
	"source" text NOT NULL,
	"input" jsonb NOT NULL,
	"expected" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"message_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reflection_run_id" uuid,
	"key" text NOT NULL,
	"scope" text NOT NULL,
	"tool_name" text,
	"lesson" text NOT NULL,
	"status" text DEFAULT 'candidate' NOT NULL,
	"confidence" real NOT NULL,
	"evidence_count" integer NOT NULL,
	"evidence_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"eval_status" text DEFAULT 'pending' NOT NULL,
	"eval_score" real,
	"baseline_score" real,
	"version" integer DEFAULT 1 NOT NULL,
	"supersedes_id" uuid,
	"approved_by" text,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_memory_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"category" text NOT NULL,
	"content" text NOT NULL,
	"source" text DEFAULT 'explicit_user' NOT NULL,
	"source_message_id" uuid,
	"status" text DEFAULT 'candidate' NOT NULL,
	"confidence" real DEFAULT 1 NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_reflection_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"prompt_version" integer NOT NULL,
	"model" text,
	"window_start" timestamp NOT NULL,
	"window_end" timestamp NOT NULL,
	"evidence_count" integer DEFAULT 0 NOT NULL,
	"candidate_count" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "assistant_trace_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"event_type" text NOT NULL,
	"name" text,
	"status" text NOT NULL,
	"duration_ms" integer,
	"model" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_trace_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"user_message_id" uuid,
	"prompt_version" integer NOT NULL,
	"outcome" text DEFAULT 'running' NOT NULL,
	"model" text,
	"iteration_count" integer DEFAULT 0 NOT NULL,
	"tool_names" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"latency_ms" integer,
	"error" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "assistant_settings" ADD COLUMN "memory_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "assistant_conversation_summaries" ADD CONSTRAINT "assistant_conversation_summaries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_conversation_summaries" ADD CONSTRAINT "assistant_conversation_summaries_through_message_id_assistant_messages_id_fk" FOREIGN KEY ("through_message_id") REFERENCES "public"."assistant_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_eval_cases" ADD CONSTRAINT "assistant_eval_cases_lesson_id_assistant_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."assistant_lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_feedback" ADD CONSTRAINT "assistant_feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_feedback" ADD CONSTRAINT "assistant_feedback_message_id_assistant_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."assistant_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_lessons" ADD CONSTRAINT "assistant_lessons_reflection_run_id_assistant_reflection_runs_id_fk" FOREIGN KEY ("reflection_run_id") REFERENCES "public"."assistant_reflection_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_lessons" ADD CONSTRAINT "assistant_lessons_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_memory_facts" ADD CONSTRAINT "assistant_memory_facts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_memory_facts" ADD CONSTRAINT "assistant_memory_facts_source_message_id_assistant_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."assistant_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_trace_events" ADD CONSTRAINT "assistant_trace_events_run_id_assistant_trace_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."assistant_trace_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_trace_events" ADD CONSTRAINT "assistant_trace_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_trace_runs" ADD CONSTRAINT "assistant_trace_runs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_trace_runs" ADD CONSTRAINT "assistant_trace_runs_user_message_id_assistant_messages_id_fk" FOREIGN KEY ("user_message_id") REFERENCES "public"."assistant_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assistant_eval_cases_lesson_idx" ON "assistant_eval_cases" USING btree ("lesson_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_feedback_user_message_uq" ON "assistant_feedback" USING btree ("user_id","message_id");--> statement-breakpoint
CREATE INDEX "assistant_feedback_rating_idx" ON "assistant_feedback" USING btree ("rating","created_at");--> statement-breakpoint
CREATE INDEX "assistant_lessons_status_idx" ON "assistant_lessons" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "assistant_lessons_key_idx" ON "assistant_lessons" USING btree ("key","status");--> statement-breakpoint
CREATE INDEX "assistant_memory_facts_user_status_idx" ON "assistant_memory_facts" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "assistant_memory_facts_expiry_idx" ON "assistant_memory_facts" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "assistant_reflection_runs_status_idx" ON "assistant_reflection_runs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "assistant_trace_events_run_idx" ON "assistant_trace_events" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE INDEX "assistant_trace_runs_user_idx" ON "assistant_trace_runs" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "assistant_trace_runs_outcome_idx" ON "assistant_trace_runs" USING btree ("outcome","started_at");
--> statement-breakpoint
-- Legacy Markdown memory is quarantined for user review. It is never promoted
-- automatically into the new active fact store.
INSERT INTO "assistant_memory_facts" (
	"id", "user_id", "category", "content", "source", "status", "confidence"
)
SELECT
	gen_random_uuid(),
	"user_id",
	'working_style',
	left("content", 500),
	'legacy_markdown',
	'candidate',
	0.5
FROM "assistant_memory"
WHERE length(trim("content")) > 0;
--> statement-breakpoint
INSERT INTO "ai_task_models" ("task_key", "model", "fallback_models") VALUES
	('assistant_complex', 'openai/gpt-5.4-mini', ARRAY['anthropic/claude-sonnet-5']),
	('assistant_summary', 'openai/gpt-5-mini', ARRAY['anthropic/claude-haiku-4.5']),
	('assistant_reflection', 'openai/gpt-5.4-mini', ARRAY['anthropic/claude-sonnet-5']),
	('assistant_eval', 'openai/gpt-5.4-mini', ARRAY['anthropic/claude-sonnet-5'])
ON CONFLICT ("task_key") DO NOTHING;
