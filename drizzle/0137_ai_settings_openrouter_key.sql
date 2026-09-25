ALTER TABLE "ai_usage_settings" ADD COLUMN "openrouter_api_key_encrypted" text;--> statement-breakpoint
ALTER TABLE "ai_usage_settings" ADD COLUMN "openrouter_api_key_updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "ai_usage_settings" ADD COLUMN "openrouter_api_key_updated_by" text;--> statement-breakpoint
ALTER TABLE "ai_usage_settings" ADD CONSTRAINT "ai_usage_settings_openrouter_api_key_updated_by_user_id_fk" FOREIGN KEY ("openrouter_api_key_updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;