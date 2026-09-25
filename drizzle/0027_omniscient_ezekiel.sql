CREATE TABLE "user_presence" (
	"user_id" text PRIMARY KEY NOT NULL,
	"last_active_at" timestamp DEFAULT now() NOT NULL,
	"last_hidden_at" timestamp,
	"manual_status" text DEFAULT 'auto' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_preferences" ADD COLUMN "push_schedule_mode" text DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_preferences" ADD COLUMN "work_hours_start" integer DEFAULT 480 NOT NULL;--> statement-breakpoint
ALTER TABLE "email_preferences" ADD COLUMN "work_hours_end" integer DEFAULT 960 NOT NULL;--> statement-breakpoint
ALTER TABLE "email_preferences" ADD COLUMN "push_only_when_active" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_presence" ADD CONSTRAINT "user_presence_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;