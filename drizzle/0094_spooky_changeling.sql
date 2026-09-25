CREATE TABLE "email_signal_lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson" text NOT NULL,
	"status" text DEFAULT 'candidate' NOT NULL,
	"confidence" real,
	"evidence_count" integer DEFAULT 1 NOT NULL,
	"evidence_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reflection_at" timestamp,
	"created_by" text,
	"approved_by" text,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_project_suggestions" ADD COLUMN "dismiss_reason" text;--> statement-breakpoint
ALTER TABLE "email_signal_lessons" ADD CONSTRAINT "email_signal_lessons_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_signal_lessons" ADD CONSTRAINT "email_signal_lessons_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_signal_lessons_status_idx" ON "email_signal_lessons" USING btree ("status","created_at");