CREATE TABLE "time_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"started_at" timestamp NOT NULL,
	"ended_at" timestamp,
	"duration_seconds" integer,
	"source" text DEFAULT 'timer' NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "auto_start_timer" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "time_entries_one_running_per_user" ON "time_entries" USING btree ("user_id") WHERE "time_entries"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "time_entries_task_idx" ON "time_entries" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "time_entries_user_started_idx" ON "time_entries" USING btree ("user_id","started_at");