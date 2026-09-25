CREATE TABLE "ai_usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"scope" text DEFAULT 'workspace' NOT NULL,
	"task_key" text,
	"feature" text NOT NULL,
	"operation" text NOT NULL,
	"model" text,
	"user_id" text,
	"actor_user_id" text,
	"project_id" uuid,
	"entity_type" text,
	"entity_id" text,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"units" double precision DEFAULT 0 NOT NULL,
	"unit_name" text,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"estimated" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage_settings" (
	"id" text PRIMARY KEY DEFAULT 'workspace' NOT NULL,
	"workspace_ai_monthly_budget_usd" double precision DEFAULT 25 NOT NULL,
	"workspace_ai_enabled" boolean DEFAULT true NOT NULL,
	"cloudflare_monthly_budget_usd" double precision DEFAULT 10 NOT NULL,
	"cloudflare_enabled" boolean DEFAULT true NOT NULL,
	"updated_by" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_settings" ADD CONSTRAINT "ai_usage_settings_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_events_scope_idx" ON "ai_usage_events" USING btree ("scope","created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_events_provider_idx" ON "ai_usage_events" USING btree ("provider","created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_events_task_idx" ON "ai_usage_events" USING btree ("task_key","created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_events_user_idx" ON "ai_usage_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_events_project_idx" ON "ai_usage_events" USING btree ("project_id","created_at");